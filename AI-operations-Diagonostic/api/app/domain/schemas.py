from __future__ import annotations
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Any

class ActivityInput(BaseModel):
    label: str = Field(default="", max_length=160)
    monthly_volume: float | None = Field(default=None)
    minutes_per_unit: float | None = Field(default=None)
    hourly_rate: float | None = Field(default=None)
    currency: str = Field(default="GBP", min_length=3, max_length=3)
    achievable_reduction_pct: float = Field(default=20, ge=0, le=100)
    rework_rate: float | None = None
    error_rate: float | None = None
    source_ids: list[str] = []
    confirmed: bool = False
    rejected: bool = False
    is_valid: bool | None = None
    validation_status: str | None = None
    validation_errors: list[str] = Field(default_factory=list)
    validation_warnings: list[str] = Field(default_factory=list)
    is_calculation_eligible: bool | None = None
    provenance: dict[str, Any] | None = None

class AssessmentCreate(BaseModel):
    template_id: str = "standard-process-v1"
    process_name: str = Field(min_length=2, max_length=160)
    sector: str = Field(default="Unspecified", max_length=100)
    period: str = Field(default="Last 30 days", max_length=100)
    unit: str = Field(default="cases", max_length=60)
    currency: str = Field(default="GBP", min_length=3, max_length=3)
    goals: str = Field(default="", max_length=1000)
    is_sandbox: bool = Field(default=False, description="Flag indicating isolated testing/sandbox assessment")
    activity_inputs: list[ActivityInput] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def handle_legacy_payloads(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("activity_inputs"):
                if data.get("activity_input"):
                    data["activity_inputs"] = [data["activity_input"]]
                elif data.get("activities"):
                    data["activity_inputs"] = data["activities"]
        return data

    @model_validator(mode="after")
    def validate_activity_fields(self) -> AssessmentCreate:
        for idx, act in enumerate(self.activity_inputs):
            if not act.label or not act.label.strip():
                raise ValueError(f"Activity {idx + 1}: activity label cannot be blank.")
            if act.monthly_volume is not None and act.monthly_volume < 0:
                raise ValueError(f"Activity {idx + 1}: monthly volume cannot be negative.")
            if act.hourly_rate is not None and act.hourly_rate < 0:
                raise ValueError(f"Activity {idx + 1}: hourly rate cannot be negative.")
            if act.minutes_per_unit is not None and act.minutes_per_unit < 0:
                raise ValueError(f"Activity {idx + 1}: minutes per unit cannot be negative.")
            if act.rework_rate is not None and (act.rework_rate < 0.0 or act.rework_rate > 1.0):
                raise ValueError(f"Activity {idx + 1}: rework rate must be between 0.0 and 1.0.")
        return self

class FactChange(BaseModel):
    activity_id: str
    label: str | None = None
    monthly_volume: float | None = None
    minutes_per_unit: float | None = None
    hourly_rate: float | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    achievable_reduction_pct: float | None = Field(default=None, ge=0, le=100)
    rework_rate: float | None = None
    error_rate: float | None = None
    source_ids: list[str] | None = None
    confirmed: bool | None = None
    rejected: bool | None = None
    is_valid: bool | None = None
    validation_status: str | None = None
    validation_errors: list[str] | None = None
    validation_warnings: list[str] | None = None
    is_calculation_eligible: bool | None = None
    provenance: dict[str, Any] | None = None

class FactPatch(BaseModel):
    expected_revision: int = Field(ge=1)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    changes: list[FactChange] = Field(default_factory=list)
    add_activities: list[ActivityInput] = Field(default_factory=list)
    remove_activity_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def check_has_action(self) -> FactPatch:
        if not self.changes and not self.add_activities and not self.remove_activity_ids and not self.currency:
            raise ValueError("At least one change, added activity, removed activity ID, or currency update is required.")
        for idx, act in enumerate(self.add_activities):
            if not act.label or not act.label.strip():
                raise ValueError(f"Added activity {idx + 1}: activity label cannot be blank.")
            if act.monthly_volume is not None and act.monthly_volume < 0:
                raise ValueError(f"Added activity {idx + 1}: monthly volume cannot be negative.")
            if act.hourly_rate is not None and act.hourly_rate < 0:
                raise ValueError(f"Added activity {idx + 1}: hourly rate cannot be negative.")
            if act.minutes_per_unit is not None and act.minutes_per_unit < 0:
                raise ValueError(f"Added activity {idx + 1}: minutes per unit cannot be negative.")
        return self

class SubmitRequest(BaseModel):
    expected_revision: int = Field(ge=1)

class ApproveRequest(BaseModel):
    expected_revision: int = Field(ge=1)
    accepted_assumptions: dict[str, Any] = {}


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)

    @model_validator(mode="after")
    def validate_registration(self) -> RegisterRequest:
        if "@" not in self.email or "." not in self.email.split("@")[-1]:
            raise ValueError("Enter a valid email address.")
        if self.password != self.confirm_password:
            raise ValueError("Password and confirm password do not match.")
        return self


class OnboardingRequest(BaseModel):
    workspace_name: str = Field(min_length=2, max_length=120)
    full_name: str = Field(min_length=2, max_length=120)
    job_title: str = Field(default="Operations Lead", max_length=120)
    sector: str = Field(default="Professional services", max_length=100)
    default_currency: str = Field(default="GBP", min_length=3, max_length=3)

    @model_validator(mode="after")
    def validate_details(self) -> OnboardingRequest:
        if not self.workspace_name.strip():
            raise ValueError("Workspace name cannot be blank.")
        if not self.full_name.strip():
            raise ValueError("Full name cannot be blank.")
        return self


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class WorkspaceMemberCreateRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=120)
    job_title: str = Field(default="", max_length=120)
    role: str = Field(default="analyst", pattern="^(admin|analyst|viewer)$")


class WorkspaceMemberRoleUpdateRequest(BaseModel):
    role: str = Field(pattern="^(admin|analyst|viewer)$")
