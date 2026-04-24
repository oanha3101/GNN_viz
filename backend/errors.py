"""
GNN-Insight Error Taxonomy.
Structured error types for training pipeline.
"""
import logging

from schemas.constants import ErrorCode

logger = logging.getLogger(__name__)


class TrainingError(Exception):
    """Structured training error with code, retriable flag, and optional field."""

    def __init__(self, code: str = ErrorCode.ERR_INTERNAL,
                 message: str = "An internal error occurred",
                 retriable: bool = True, field: str = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.retriable = retriable
        self.field = field

    def to_payload(self) -> dict:
        """Convert to wire payload (no traceback)."""
        d = {
            'code': self.code,
            'message': self.message,
            'retriable': self.retriable,
        }
        if self.field:
            d['field'] = self.field
        return d


class ConfigError(TrainingError):
    def __init__(self, message: str, field: str = None):
        super().__init__(
            code=ErrorCode.ERR_INVALID_CONFIG,
            message=message,
            retriable=False,
            field=field,
        )


class DataLoadError(TrainingError):
    def __init__(self, message: str):
        super().__init__(
            code=ErrorCode.ERR_DATA_LOAD_FAILED,
            message=message,
            retriable=True,
        )


class ModelBuildError(TrainingError):
    def __init__(self, message: str):
        super().__init__(
            code=ErrorCode.ERR_MODEL_BUILD_FAILED,
            message=message,
            retriable=False,
        )
