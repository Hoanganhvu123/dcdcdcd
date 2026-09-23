import logging
import pandas as pd

from dbgpt_analyst.common.db import get_db_connection

logger = logging.getLogger(__name__)


def deep_clean_dataframe(df: pd.DataFrame) -> tuple:
    """Cleans a dataframe. Returns (cleaned_df, cleaning_report).
    Report keys: rows_dropped, cols_dropped (list), cols_retyped (list).
    """
    if df.empty:
        return df, {"rows_dropped": 0, "cols_dropped": [], "cols_retyped": []}

    rows_before = len(df)
    cols_before = list(df.columns)

    # Drop "Unnamed: N" columns produced by Excel/CSV blank header cells
    unnamed_cols = [c for c in df.columns if str(c).startswith("Unnamed:")]
    if unnamed_cols:
        df = df.drop(columns=unnamed_cols)

    # Drop fully empty rows and columns
    df = df.dropna(axis=0, how="all")
    df = df.dropna(axis=1, how="all")

    cols_dropped = [c for c in cols_before if c not in list(df.columns)]
    rows_dropped = rows_before - len(df)
    cols_retyped = []

    # Strip leading/trailing whitespace from string columns (object or StringDtype — pandas 2/3 compat)
    for col in df.columns:
        if pd.api.types.is_string_dtype(df[col]) and not pd.api.types.is_numeric_dtype(df[col]):
            try:
                df[col] = df[col].str.strip()
            except Exception:
                pass

    for col in df.columns:
        col_str = str(col).lower()

        # 1. Date heuristics
        if any(keyword in col_str for keyword in ["date", "ngày", "time", "ngay"]):
            try:
                original = df[col].copy()
                converted: pd.Series = pd.to_datetime(df[col], errors="coerce")
                if float(converted.count()) / max(len(df[col]), 1) >= 0.8:
                    df[col] = converted
                    cols_retyped.append(col)
                else:
                    df[col] = original
            except Exception:
                pass

        # 2. Currency / Numeric heuristics
        elif any(keyword in col_str for keyword in ["vnd", "usd", "amount", "price", "tiền", "tien", "doanh thu", "revenue", "cost", "phi"]):
            if pd.api.types.is_string_dtype(df[col]) and not pd.api.types.is_numeric_dtype(df[col]):
                try:
                    original = df[col].copy()
                    cleaned = df[col].astype(str).str.replace(",", "", regex=False)
                    cleaned = cleaned.str.replace(r"[^\d\.\-]", "", regex=True)
                    converted: pd.Series = pd.to_numeric(cleaned, errors="coerce")
                    if float(converted.count()) / max(len(df[col]), 1) >= 0.8:
                        df[col] = converted
                        cols_retyped.append(col)
                    else:
                        df[col] = original
                except Exception:
                    pass

    return df, {"rows_dropped": rows_dropped, "cols_dropped": cols_dropped, "cols_retyped": cols_retyped}


def profile_value_overlap(new_table_name: str, source_id: int = 0):
    """Check 2: Value-Overlap Profiling.
    Queries 1000 distinct values from the new table, compares them with other tables in the DB.
    If overlap > 80%, suggests a relationship.
    """
    THRESHOLD = 0.8
    SAMPLE_LIMIT = 1000

    conn = get_db_connection()
    try:
        cur = conn.cursor()

        # 1. Get all tables in public schema that start with 'excel_'
        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
              AND table_type = 'BASE TABLE'
              AND table_name != %s
              AND table_name LIKE 'excel_%%'
        """, (new_table_name,))
        other_tables = [row["table_name"] if isinstance(row, dict) else row[0] for row in cur.fetchall()]

        if not other_tables:
            return None

        # 2. Get columns of the new table
        cur.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = %s
        """, (new_table_name,))
        new_cols_raw = cur.fetchall()
        new_cols = []
        for row in new_cols_raw:
            col_name = row["column_name"] if isinstance(row, dict) else row[0]
            data_type = row["data_type"] if isinstance(row, dict) else row[1]
            if data_type in ("text", "character varying", "integer", "bigint", "uuid", "double precision", "numeric"):
                new_cols.append(col_name)

        # Cache to store sampled values for the new table
        new_table_samples = {}
        for col in new_cols:
            try:
                cur.execute(f'SELECT DISTINCT "{col}" FROM "{new_table_name}" WHERE "{col}" IS NOT NULL LIMIT {SAMPLE_LIMIT}')
                samples_raw = cur.fetchall()
                samples = set(str(row[col] if isinstance(row, dict) else row[0]).strip() for row in samples_raw)
                samples = {s for s in samples if s and s.lower() != "nan" and s.lower() != "null"}
                if len(samples) > 0:
                    new_table_samples[col] = samples
            except Exception as e:
                logger.warning(f"Error sampling {new_table_name}.{col}: {e}")

        # 3. Compare with other tables
        suggestions = []
        for other_table in other_tables:
            cur.execute("""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = %s
            """, (other_table,))
            other_cols_raw = cur.fetchall()
            other_cols = []
            for row in other_cols_raw:
                col_name = row["column_name"] if isinstance(row, dict) else row[0]
                data_type = row["data_type"] if isinstance(row, dict) else row[1]
                if data_type in ("text", "character varying", "integer", "bigint", "uuid", "double precision", "numeric"):
                    other_cols.append(col_name)

            for other_col in other_cols:
                try:
                    cur.execute(f'SELECT DISTINCT "{other_col}" FROM "{other_table}" WHERE "{other_col}" IS NOT NULL LIMIT {SAMPLE_LIMIT}')
                    other_samples_raw = cur.fetchall()
                    other_samples = set(str(row[other_col] if isinstance(row, dict) else row[0]).strip() for row in other_samples_raw)
                    other_samples = {s for s in other_samples if s and s.lower() != "nan" and s.lower() != "null"}

                    if len(other_samples) < 5:
                        continue

                    for new_col, new_samples in new_table_samples.items():
                        if len(new_samples) < 5:
                            continue

                        try:
                            cur.execute(f'SELECT COUNT(DISTINCT "{new_col}")::float / NULLIF(COUNT(*), 0) FROM "{new_table_name}"')
                            new_card_row = cur.fetchone()
                            new_cardinality = float(new_card_row[0] or 0) if new_card_row else 0.0
                            cur.execute(f'SELECT COUNT(DISTINCT "{other_col}")::float / NULLIF(COUNT(*), 0) FROM "{other_table}"')
                            other_card_row = cur.fetchone()
                            other_cardinality = float(other_card_row[0] or 0) if other_card_row else 0.0
                            if new_cardinality >= 0.95 and other_cardinality >= 0.95:
                                continue
                        except Exception:
                            pass

                        intersection = new_samples.intersection(other_samples)
                        if not intersection:
                            continue

                        min_len = min(len(new_samples), len(other_samples))
                        if min_len == 0:
                            continue

                        overlap_ratio = len(intersection) / min_len

                        if overlap_ratio >= THRESHOLD:
                            suggestions.append({
                                "from_table": new_table_name,
                                "from_column": new_col,
                                "to_table": other_table,
                                "to_column": other_col,
                                "confidence": round(overlap_ratio, 2),
                            })
                except Exception as e:
                    logger.warning(f"Error sampling {other_table}.{other_col}: {e}")

        # 4. Insert suggestions into table_relationships
        for s in suggestions:
            try:
                cur.execute("""
                    INSERT INTO table_relationships
                        (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE, FALSE)
                    ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
                        SET confidence=EXCLUDED.confidence, ai_suggested=TRUE
                """, (
                    str(source_id), str(source_id), s["from_table"], s["from_column"],
                    str(source_id), s["to_table"], s["to_column"],
                    "LEFT", float(s["confidence"])
                ))
            except Exception as e:
                logger.warning(f"Error inserting relationship {s}: {e}")

        conn.commit()
        return suggestions
    except Exception as e:
        logger.error(f"Value-Overlap profiling error: {e}")
        return []
    finally:
        conn.close()
