"""GIO web API. Stateless: the browser sends its items and settings with every request,
so it runs the same locally and as a Vercel serverless function."""
import csv
import io
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, ValidationError

from . import calc, data, planner, routing

app = FastAPI(title="Green Inventory Optimizer")


class Item(BaseModel):
    id: int = 0
    name: str = Field(min_length=1, max_length=80)
    unit: str = Field(min_length=1, max_length=20)
    stock: float = Field(ge=0)
    weekly_demand: float = Field(gt=0)
    price: float = Field(gt=0)
    order_cost: float = Field(ge=0)
    weight_kg: float = Field(gt=0)
    lead_time_weeks: int = Field(ge=0, le=12)
    distance_km: float = Field(ge=0, le=10000)


class Settings(BaseModel):
    currency_symbol: str = data.DEFAULT_SETTINGS["currency_symbol"]
    plant_city: str = Field(default=data.DEFAULT_SETTINGS["plant_city"], min_length=2)
    weeks: int = Field(default=data.DEFAULT_SETTINGS["weeks"], ge=2, le=26)
    holding_pct: float = Field(default=data.DEFAULT_SETTINGS["holding_pct"], ge=0, le=100)
    demand_variation_pct: float = Field(default=data.DEFAULT_SETTINGS["demand_variation_pct"], ge=0, le=100)
    service_level_pct: float = Field(default=data.DEFAULT_SETTINGS["service_level_pct"], ge=50, le=99.9)
    shortage_cost_multiplier: float = Field(default=data.DEFAULT_SETTINGS["shortage_cost_multiplier"], ge=1, le=20)
    fuel_price: float = Field(default=data.DEFAULT_SETTINGS["fuel_price"], gt=0)

    def full(self):
        return {**data.DEFAULT_SETTINGS, **self.model_dump()}


class Workspace(BaseModel):
    items: list[Item] = Field(max_length=200)
    settings: Settings = Settings()


def item_view(it, s):
    n = planner.item_numbers(it, s)
    return {**it, "safety_stock": round(n["safety_stock"]), "reorder_point": round(n["reorder_point"]),
            "eoq": round(n["eoq"]), "weeks_left": round(calc.weeks_of_stock(it["stock"], it["weekly_demand"]), 1),
            "status": calc.stock_status(it["stock"], n["reorder_point"], it["weekly_demand"], it["lead_time_weeks"]),
            "stock_value": round(it["stock"] * it["price"])}


def unique_ids(items):
    """Give every item a distinct id and reject duplicate names."""
    seen, out = set(), []
    for k, it in enumerate(items, start=1):
        if it["name"].strip().lower() in seen:
            raise HTTPException(400, f"Two items are called '{it['name']}'. Item names must be different.")
        seen.add(it["name"].strip().lower())
        out.append({**it, "id": it["id"] or k})
    if len({it["id"] for it in out}) != len(out):
        out = [{**it, "id": k} for k, it in enumerate(out, start=1)]
    return out


# ---------------------------------------------------------------- endpoints

@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/defaults")
def defaults():
    return {"settings": data.DEFAULT_SETTINGS, "items": data.sample_items()}


@app.post("/api/items/check")
def check_items(ws: Workspace):
    """Stock analysis for the items: EOQ, safety stock, reorder level and status."""
    s = ws.settings.full()
    rows = [item_view(it, s) for it in unique_ids([i.model_dump() for i in ws.items])]
    return {"items": rows, "stock_value": sum(r["stock_value"] for r in rows),
            "urgent": [r["name"] for r in rows if r["status"] == "urgent"],
            "order_soon": [r["name"] for r in rows if r["status"] == "order soon"]}


@app.get("/api/items/template.csv")
def template():
    rows = ",".join(data.ITEM_FIELDS) + "\nSteel sheets,sheets,1400,400,1950,3500,29.4,1,112\n"
    return Response(rows, media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="items_template.csv"'})


@app.post("/api/items/parse-csv")
async def parse_csv(file: UploadFile = File(...)):
    """Validate a CSV of items and return them. Nothing is accepted if any row is invalid."""
    raw = await file.read()
    if len(raw) > 1_000_000:
        raise HTTPException(400, "The file is too big (max 1 MB).")
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig", errors="replace")))
    missing = [f for f in data.ITEM_FIELDS if f not in (reader.fieldnames or [])]
    if missing:
        raise HTTPException(400, f"The file is missing these columns: {', '.join(missing)}. Download the template to see the format.")
    good, errors, names = [], [], set()
    for row_no, row in enumerate(reader, start=2):
        if not any((v or "").strip() for v in row.values()):
            continue
        try:
            item = Item(id=len(good) + 1, **{f: (row[f] or "").strip() for f in data.ITEM_FIELDS})
        except ValidationError as e:
            errors += [f"Row {row_no}, {err['loc'][0]}: {err['msg']}" for err in e.errors()]
            continue
        if item.name.lower() in names:
            errors.append(f"Row {row_no}: '{item.name}' appears twice")
        names.add(item.name.lower())
        good.append(item.model_dump())
    if errors:
        raise HTTPException(400, "Nothing was imported. Please fix: " + "; ".join(errors[:15]))
    if not good:
        raise HTTPException(400, "The file has no item rows.")
    if len(good) > 200:
        raise HTTPException(400, "Please keep the list to 200 items or fewer.")
    return {"items": good}


class PlanRequest(Workspace):
    mode: str = Field(pattern="^(cheapest|greenest)$")


@app.post("/api/plan")
def create_plan(body: PlanRequest):
    s = body.settings.full()
    items = unique_ids([i.model_dump() for i in body.items])
    try:
        result = planner.make_plan(items, s, body.mode)
    except planner.PlanError as e:
        raise HTTPException(400, str(e))
    result["item_names"] = {it["id"]: it["name"] for it in items}
    result["created_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    return result


class DeliveryRequest(BaseModel):
    from_place: str = Field(min_length=2, max_length=120)
    to_place: str = Field(min_length=2, max_length=120)
    weight_kg: float = Field(gt=0, le=500000)
    fuel_price: float = Field(default=data.DEFAULT_SETTINGS["fuel_price"], gt=0, le=1000)


@app.post("/api/delivery")
def delivery(body: DeliveryRequest):
    try:
        a = routing.find_place(data.NOMINATIM_URL, body.from_place)
        b = routing.find_place(data.NOMINATIM_URL, body.to_place)
        route = routing.road_route(data.OSRM_URL, a, b)
    except routing.RoutingError as e:
        raise HTTPException(400, str(e))
    options = calc.delivery_options(body.weight_kg, route["distance_km"], body.fuel_price)
    greenest = min(options, key=lambda o: o["co2_kg"])["option"]
    cheapest = min(options, key=lambda o: o["cost"])["option"]
    return {"from": a, "to": b, **route, "options": options, "greenest": greenest, "cheapest": cheapest}


# ---------------------------------------------------------------- website (local runs only; Vercel serves it statically)

DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def site(path: str):
        f = DIST / path
        return FileResponse(f if path and f.is_file() else DIST / "index.html")
