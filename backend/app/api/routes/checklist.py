"""
Post-completion checklist routes.
On first GET the checklist is seeded with default items for that user.
"""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.models import ChecklistItem
from app.models.schemas import ChecklistResponse, ChecklistItemResponse, ChecklistToggleRequest
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/v1/checklist", tags=["checklist"])

# Default items every new homeowner should complete
DEFAULT_ITEMS = [
    # urgent
    dict(title="Register with the Land Registry",         description="Your solicitor should handle this, but confirm it's been submitted within 2 months of completion.",  deadline_days=60,  category="urgent",    sort_order=1),
    dict(title="Set up buildings insurance",              description="Required from exchange date. Ensure policy value covers rebuild cost, not market value.",             deadline_days=1,   category="urgent",    sort_order=2),
    dict(title="Change the locks",                        description="Previous owners may have given keys to tradespeople, neighbours, or family. Change all exterior locks.", deadline_days=7, category="urgent",   sort_order=3),
    dict(title="Redirect your post",                      description="Set up Royal Mail redirection from your old address for at least 12 months.",                         deadline_days=7,   category="urgent",    sort_order=4),
    dict(title="Notify HMRC of new address",              description="Update your address for tax, National Insurance, and any HMRC correspondence.",                       deadline_days=30,  category="urgent",    sort_order=5),
    # important
    dict(title="Register for council tax",                description="Contact your local council to register in your name. Previous occupant's account won't transfer.",    deadline_days=14,  category="important", sort_order=6),
    dict(title="Set up utility accounts",                 description="Contact gas, electricity, and water suppliers to set up accounts in your name and provide meter readings.", deadline_days=7, category="important", sort_order=7),
    dict(title="Set up broadband",                        description="Lead time can be 2–4 weeks. Order as soon as possible.",                                              deadline_days=7,   category="important", sort_order=8),
    dict(title="Update your electoral roll registration", description="Register at your new address at gov.uk/register-to-vote.",                                            deadline_days=30,  category="important", sort_order=9),
    dict(title="Update your driving licence address",     description="Update at gov.uk/change-address-driving-licence within 30 days — there's a fine if you don't.",      deadline_days=30,  category="important", sort_order=10),
    dict(title="Notify your bank and pension providers",  description="Update your address with all financial institutions — banks, pensions, ISAs, credit cards.",          deadline_days=30,  category="important", sort_order=11),
    # admin
    dict(title="Locate the stopcock",                     description="Find the main water stopcock before you need it in an emergency.",                                    deadline_days=3,   category="admin",     sort_order=12),
    dict(title="Locate the fuse box and gas meter",       description="Note their locations and take meter readings on moving-in day.",                                      deadline_days=1,   category="admin",     sort_order=13),
    dict(title="Collect all warranties and manuals",      description="Gather manuals for appliances, boiler, windows, and any work done under guarantee.",                  deadline_days=14,  category="admin",     sort_order=14),
    dict(title="Check smoke and CO alarms",               description="Test all alarms and replace batteries. Add CO alarms near gas appliances if not present.",            deadline_days=3,   category="admin",     sort_order=15),
    dict(title="Review home contents insurance",          description="Set up contents insurance — buildings alone does not cover your belongings.",                         deadline_days=14,  category="admin",     sort_order=16),
]


async def seed_checklist(user_id: str, db: AsyncSession) -> list[ChecklistItem]:
    items = [
        ChecklistItem(
            user_id=user_id,
            title=d["title"],
            description=d["description"],
            deadline_days=d.get("deadline_days"),
            category=d["category"],
            sort_order=d["sort_order"],
            stage="homeowner",
            is_complete=False,
        )
        for d in DEFAULT_ITEMS
    ]
    db.add_all(items)
    await db.commit()
    for item in items:
        await db.refresh(item)
    return items


def to_response(item: ChecklistItem) -> ChecklistItemResponse:
    return ChecklistItemResponse(
        id=item.id,
        title=item.title,
        description=item.description,
        deadline_days=item.deadline_days,
        is_complete=item.is_complete,
        stage=item.stage.value if hasattr(item.stage, "value") else item.stage,
        sort_order=item.sort_order,
        category=getattr(item, "category", "admin"),
    )


@router.get("", response_model=ChecklistResponse)
async def get_checklist(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChecklistItem)
        .where(ChecklistItem.user_id == user_id)
        .order_by(ChecklistItem.sort_order)
    )
    items = result.scalars().all()

    if not items:
        items = await seed_checklist(user_id, db)

    complete = sum(1 for i in items if i.is_complete)
    return ChecklistResponse(
        items=[to_response(i) for i in items],
        total=len(items),
        complete=complete,
    )


@router.patch("/{item_id}", response_model=ChecklistItemResponse)
async def toggle_item(
    item_id: UUID,
    body: ChecklistToggleRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChecklistItem).where(
            ChecklistItem.id == item_id,
            ChecklistItem.user_id == user_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    item.is_complete = body.is_complete
    await db.commit()
    await db.refresh(item)
    return to_response(item)
