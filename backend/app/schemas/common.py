from __future__ import annotations

from decimal import Decimal
from typing import Annotated, Generic, List, TypeVar

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer


T = TypeVar("T")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int
    pages: int


NumberOut = PlainSerializer(lambda value: float(value or 0), return_type=float, when_used="json")

Quantity = Annotated[Decimal, Field(gt=0, max_digits=18, decimal_places=4), NumberOut]
NonNegativeQuantity = Annotated[
    Decimal, Field(ge=0, max_digits=18, decimal_places=4), NumberOut
]
Money = Annotated[Decimal, Field(ge=0, max_digits=18, decimal_places=4), NumberOut]


class Message(BaseModel):
    message: str
