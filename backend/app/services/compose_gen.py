import uuid
import yaml
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.models.canvas import Canvas, CanvasComponent


# Template mapping: component_type -> docker service config
SERVICE_TEMPLATES = {
    "service": {
        "build": "./{name}",
        "ports": ["{port}:{port}"],
        "environment": {},
        "depends_on": [],
    },
    "database": {
        "postgres": {
            "image": "postgres:16",
            "environment": {
                "POSTGRES_DB": "{name}",
                "POSTGRES_USER": "{name}",
                "POSTGRES_PASSWORD": "{name}_pass",
            },
            "ports": ["5432:5432"],
            "volumes": ["{name}_data:/var/lib/postgresql/data"],
        },
        "redis": {
            "image": "redis:7-alpine",
            "ports": ["6379:6379"],
        },
        "mongodb": {
            "image": "mongo:7",
            "ports": ["27017:27017"],
        },
    },
    "queue": {
        "image": "rabbitmq:3-management",
        "ports": ["5672:5672", "15672:15672"],
    },
}


async def generate_compose_from_canvas(canvas_id: uuid.UUID, db: AsyncSession) -> str:
    result = await db.execute(
        select(Canvas).where(Canvas.id == canvas_id).options(selectinload(Canvas.components))
    )
    canvas = result.scalar_one_or_none()
    if not canvas:
        raise ValueError(f"Canvas {canvas_id} not found")

    services = {}
    volumes = {}
    port_counter = 8000

    for comp in canvas.components:
        name = comp.name.lower().replace(" ", "-").replace("_", "-")
        ctype = comp.component_type.lower()
        tech = (comp.tech_stack or "").lower()

        if ctype == "database":
            if "postgres" in tech or "pg" in tech:
                svc = dict(SERVICE_TEMPLATES["database"]["postgres"])
                svc["environment"] = {k: v.format(name=name) for k, v in svc["environment"].items()}
                svc["volumes"] = [v.format(name=name) for v in svc["volumes"]]
                volumes[f"{name}_data"] = None
            elif "redis" in tech:
                svc = dict(SERVICE_TEMPLATES["database"]["redis"])
            elif "mongo" in tech:
                svc = dict(SERVICE_TEMPLATES["database"]["mongodb"])
            else:
                svc = dict(SERVICE_TEMPLATES["database"]["postgres"])
                svc["environment"] = {k: v.format(name=name) for k, v in svc["environment"].items()}
                svc["volumes"] = [v.format(name=name) for v in svc["volumes"]]
                volumes[f"{name}_data"] = None
        elif ctype == "queue":
            svc = dict(SERVICE_TEMPLATES["queue"])
        else:
            # Default: service
            port = port_counter
            port_counter += 1
            svc = {
                "build": f"./{name}",
                "ports": [f"{port}:{port}"],
                "environment": {},
            }
            if comp.description:
                svc["environment"]["SERVICE_DESC"] = comp.description[:200]

        services[name] = svc

    compose = {"version": "3.9", "services": services}
    if volumes:
        compose["volumes"] = volumes

    return yaml.dump(compose, default_flow_style=False, sort_keys=False)
