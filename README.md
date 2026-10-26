# Green Inventory Optimizer (GIO)

A simple web app that tells a small factory **what raw materials to order, when, and how much**, at the
lowest cost, and shows the **CO₂ from the trucks** that deliver them.

Made as a 3rd-year engineering project. It uses real optimisation (linear programming) and real road
distances from OpenStreetMap, but keeps the screens simple.

## What it does

| Page | What you see |
|---|---|
| **Home** | "What should I do?": items to order this week, items running low, and why the plan is better |
| **My Items** | Your raw materials (add, edit, delete, or upload a CSV). Shows the best order size (EOQ), safety stock and a status: OK / Order soon / Order now |
| **Order Plan** | Choose **Cheapest** or **Greenest**, then click *Create plan*. You get a week-by-week list of orders and trucks, compared with the usual "simple reorder rule". Mark the plan as checked and download it as CSV |
| **Delivery & CO₂** | Type two places and a weight. GIO finds the road distance and compares a small truck, a large truck and a train (cost, diesel, CO₂) |

The app does **not** place orders. A person must check the plan first.

Your items, settings and latest plan are saved **in your own browser** (localStorage). The server only does
the calculations and keeps no database, so each person who opens the website has their own data, and the
example items load automatically the first time.

## Deploy on Vercel

The project is ready for Vercel as-is:

* the React website is built from `frontend/` and served as static files
* the Python API (`api/index.py` → `backend/app`) runs as a Vercel serverless function at `/api/...`
* settings live in `vercel.json`, Python packages in the root `requirements.txt`, and the Python version in `.python-version`

**Option A: from GitHub (easiest)**
1. Put the `gio` folder in a GitHub repository (the folder that contains `vercel.json` must be the repository root).
2. On vercel.com choose **Add New → Project**, import the repository and click **Deploy**.
   Leave *Framework Preset* as "Other" and the root directory as `./`; build settings come from `vercel.json`.

**Option B: from your computer**
```powershell
npm install -g vercel
cd gio
vercel          # first time: log in and answer the setup questions (accept the defaults)
vercel --prod   # publish
```

After deploying, open the site and click **Order Plan → Create plan** to check that the optimiser works.
The Delivery page needs the public OpenStreetMap services, which are free but rate-limited, so they are fine
for a demo but not for heavy use.

## How to run on your own computer

You need **Python 3.10+** and **Node.js 18+**.

```powershell
# Windows: from the gio folder
.\start.ps1
```
```sh
# Mac / Linux
sh start.sh
```

Then open **http://127.0.0.1:8000**. The first start loads 6 example items, so you can try everything right away.

Run the tests:
```powershell
cd backend
.\.venv\Scripts\python -m pytest -q
```

## Technology

* **Backend:** Python, FastAPI, PuLP with the free HiGHS solver (CBC is used if HiGHS is missing). No database: data is kept in the browser.
* **Frontend:** React, Tailwind CSS, Recharts (charts), Leaflet (map)
* **Maps:** OpenStreetMap: Nominatim (place → coordinates) and OSRM (road route). Needs internet for the Delivery page only.

## Project files

```
gio/
├── vercel.json                Vercel build + routing settings
├── requirements.txt           Python packages for Vercel
├── api/index.py               Vercel entry point (loads backend/app/main.py)
├── start.ps1 / start.sh / GIO.bat   run on your own computer
├── backend/
│   ├── app/main.py            web API (stock check, CSV import, plan, delivery)
│   ├── app/planner.py         simple reorder rule + optimisation model + plain-English summary
│   ├── app/calc.py            EOQ, safety stock, reorder point, truck fuel/CO₂/cost
│   ├── app/routing.py         OpenStreetMap distance lookup
│   ├── app/data.py            default settings and example items
│   └── tests/test_gio.py      17 automated tests
└── frontend/src/
    ├── store.jsx              saves items, settings and plan in the browser
    └── pages/                 Home, Items, Plan, Delivery
```

## The maths (simple version)

**Item data:** stock, weekly use, price, order cost, weight per unit, delivery time (weeks), supplier distance (km).

**Inventory formulas**
* Best order size (EOQ) = √(2 × yearly use × order cost ÷ (price × storage %))
* Safety stock = z × (weekly use × variation %) × √(delivery time + 1), where z = 1.645 for 95%
* Reorder level = weekly use × (delivery time + 1) + safety stock

**Trucks** (typical values, kept generic on purpose)

| Vehicle | Carries up to | Diesel per 100 km | Other cost per km |
|---|---|---|---|
| Small truck | 3,000 kg | 12 L | ₹8 |
| Large truck | 20,000 kg | 30 L | ₹15 |

* Diesel used = km × L per 100 km ÷ 100
* CO₂ = diesel litres × **2.69 kg** (US EPA: 10.18 kg CO₂ per US gallon of diesel)
* Trip cost = diesel × diesel price + km × other cost
* Train (Delivery page only, rough estimate) = 0.028 kg CO₂ and ₹1.6 per tonne per km

**Optimisation model (Mixed-Integer Linear Program)**, for each item and each week t:

* Decide: order quantity x, whether to order y (yes/no), small trucks s and large trucks l (whole numbers)
* Stock balance: stock(t) = stock(t−1) + order arriving this week − weekly use + missed demand
* Trucks must carry the order: weight × x ≤ 3,000·s + 20,000·l
* An order can only be placed if y = 1, and must arrive inside the planning period
* Try to keep safety stock (small penalty if below it)
* **Cheapest** minimises ordering cost + storage cost + truck cost + cost of missed demand
  (missing a unit is counted as 3 × its price, i.e. lost production)
* **Greenest** minimises truck CO₂ first (while meeting the same demand), then cost

**The comparison ("simple rule")** is what many factories do: when stock + incoming falls to the reorder
level, order the EOQ amount and use the cheapest trucks. Both plans are scored the same way. Stock left
at the end is counted at its price, so a plan can't look cheaper just by ending with less stock.

## Worked example (Steel sheets, example data)

Weekly use 400, price ₹1,950, order cost ₹3,500, storage 20%/year, delivery 1 week, variation 20%:

* EOQ = √(2 × 20,800 × 3,500 ÷ 390) = **611 sheets**
* Safety stock = 1.645 × 80 × √2 = **186**; reorder level = 400 × 2 + 186 = **986**
* Stock 1,400 lasts 3.5 weeks, so the status is **OK**

One large truck to the supplier 112 km away: diesel = 112 × 30 ÷ 100 = **33.6 L**,
CO₂ = 33.6 × 2.69 = **90.4 kg**, cost = 33.6 × ₹90 + 112 × ₹15 = **₹4,704**.

On the 6 example items over 8 weeks, the cheapest plan costs about ₹47,000 less than the simple rule
and needs 17 trucks instead of 22, with about 400 kg (26%) less truck CO₂.

## CSV format for uploading items

```
name,unit,stock,weekly_demand,price,order_cost,weight_kg,lead_time_weeks,distance_km
Steel sheets,sheets,1400,400,1950,3500,29.4,1,112
```
Download the template from the My Items page. If any row is wrong, nothing is imported and the row numbers are shown.

## Limitations

* The example items are made up; only the idea and the formulas are real.
* Weekly demand is treated as constant; the safety stock covers normal variation.
* Truck fuel use is a typical value and does not change with load, and each item comes from one supplier.
* Driving time is for a car with no traffic. The train option is a rough estimate.
* Only truck CO₂ is counted (not electricity, waste, etc.).
* No login. Data is stored per browser: clearing browser data removes it, and it does not sync between devices.
* A person must check every plan before ordering.
