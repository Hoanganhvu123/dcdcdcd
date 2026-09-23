"""libs/bi/mock_data.py — Sanitize tên + anonymize/mock dữ liệu khi upload.

Tách khỏi `api/bi_platform/dataset_router.py` (task #31).
- `sanitize_name`: chuẩn hoá tên bảng/cột về snake_case hợp lệ.
- `anonymize_and_mock_df`: sinh dữ liệu giả thống kê (SDV nếu có, fallback
  shuffler/anonymizer) để demo mà không lộ dữ liệu thật.
"""
import logging
import random
import re

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


def sanitize_name(name: str) -> str:
    """Sanitize name to a valid lowercase snake_case SQLite table/column name."""
    # Convert to lowercase
    sanitized = name.lower()
    # Replace spaces and special characters with underscore
    sanitized = re.sub(r"[^a-zA-Z0-9_]", "_", sanitized)
    # Collapse multiple underscores
    sanitized = re.sub(r"_+", "_", sanitized)
    # Remove leading/trailing underscores
    return sanitized.strip("_")


def anonymize_and_mock_df(df: pd.DataFrame) -> pd.DataFrame:
    """
    Anonymize and mock DataFrame using SDV if installed,
    otherwise falling back to a statistically consistent Faker-style shuffler/anonymizer.
    """
    try:
        import warnings
        from sdv.metadata import SingleTableMetadata
        from sdv.single_table import GaussianCopulaSynthesizer
        warnings.filterwarnings("ignore")

        # 1. Detect Metadata
        metadata = SingleTableMetadata()
        metadata.detect_from_dataframe(df)

        # 2. Train synthesizer
        synthesizer = GaussianCopulaSynthesizer(metadata)
        synthesizer.fit(df)

        # 3. Sample new rows
        df_mock = synthesizer.sample(num_rows=len(df))
        return df_mock
    except Exception as e:
        logger.warning(f"SDV Synthesizer failed or not installed: {e}. Falling back to statistical Faker/shuffler.")

        df_mock = df.copy()

        # Obfuscate numeric columns and shuffle categories
        for col in df_mock.columns:
            if pd.api.types.is_numeric_dtype(df_mock[col]):
                vals = df_mock[col].to_numpy(dtype=float)
                # Compute random noise (+/- 15%)
                noise = np.random.uniform(0.85, 1.15, size=len(vals))
                df_mock[col] = vals * noise
            elif pd.api.types.is_datetime64_any_dtype(df_mock[col]) or "date" in str(col).lower() or "time" in str(col).lower():
                vals = list(df_mock[col])
                random.shuffle(vals)
                df_mock[col] = vals
            else:
                vals = df_mock[col].astype(str).tolist()
                is_email = any("@" in str(x) for x in vals[:10])
                is_phone = any(str(x).isdigit() and len(str(x)) >= 9 for x in vals[:10])

                if is_email:
                    df_mock[col] = [f"user_{i}@example.com" for i in range(len(df_mock))]
                elif is_phone:
                    df_mock[col] = [f"09{random.randint(10000000, 99999999)}" for i in range(len(df_mock))]
                else:
                    # Categorical values: shuffle them to keep frequency distribution
                    unique_vals = list(set(x for x in vals if x and x != "nan"))
                    if unique_vals:
                        random.shuffle(vals)
                        df_mock[col] = vals
                    else:
                        df_mock[col] = [f"item_{random.randint(1, 100)}" for _ in range(len(df_mock))]
        return df_mock
