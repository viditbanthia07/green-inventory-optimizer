"""Default settings and example items. The app keeps no server-side database: each user's
items, settings and latest plan are stored in their own browser and sent with each request."""

DEFAULT_SETTINGS = {
    "currency_symbol": "₹",
    "plant_city": "Chakan, Pune",
    "weeks": 8,                       # planning horizon
    "holding_pct": 20,                # yearly storage cost as % of item price
    "demand_variation_pct": 20,       # how much weekly demand usually varies
    "service_level_pct": 95,          # chance of not running out during lead time
    "shortage_cost_multiplier": 3,    # running out of 1 unit costs 3x its price (lost production)
    "fuel_price": 90,                 # diesel price per litre
    "time_limit_s": 20,
}

OSRM_URL = "https://router.project-osrm.org"
NOMINATIM_URL = "https://nominatim.openstreetmap.org"

ITEM_FIELDS = ["name", "unit", "stock", "weekly_demand", "price", "order_cost", "weight_kg", "lead_time_weeks", "distance_km"]

SAMPLE_ITEMS = [
    # name, unit, stock, weekly demand, price, order cost, kg per unit, lead time (weeks), supplier distance (km)
    ("Steel sheets", "sheets", 1400, 400, 1950, 3500, 29.4, 1, 112),
    ("Aluminium rods", "rods", 520, 120, 2300, 3000, 8.2, 2, 638),
    ("Plastic granules", "bags", 150, 80, 2800, 1500, 25, 1, 16),
    ("Ball bearings", "pieces", 14000, 3000, 82, 2500, 0.13, 2, 1100),
    ("Paint", "boxes", 50, 25, 6400, 1200, 20, 1, 16),
    ("Cardboard boxes", "bundles", 260, 60, 900, 800, 10, 1, 16),
]


def sample_items():
    return [{"id": i + 1, **dict(zip(ITEM_FIELDS, row))} for i, row in enumerate(SAMPLE_ITEMS)]
