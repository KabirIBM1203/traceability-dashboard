from pathlib import Path

import pandas as pd


class RevTracService:

    def __init__(self):
        # revtrac_service.py
        # -> services
        # -> app
        # -> backend
        # -> traceability-dashboard
        self.project_root = Path(__file__).resolve().parents[3]

        self.reference_file = (
            self.project_root
            / "data"
            / "revtrac"
            / "EXPORT_Reference_08082026.XLSX"
        )

        self.transport_file = (
            self.project_root
            / "data"
            / "revtrac"
            / "EXPORT_TR_08082026.XLSX"
        )

        # Load both Excel files eagerly at startup so the first API
        # request pays no cold-start penalty from pd.read_excel().
        self._reference_df = self._read_reference()
        self._transport_df = self._read_transports()

    # ------------------------------------------------------------------
    # Internal readers (called once at __init__ time)
    # ------------------------------------------------------------------

    def _read_reference(self) -> pd.DataFrame:
        df = pd.read_excel(self.reference_file, sheet_name="Sheet1")
        df["Ref Value"] = (
            df["Ref Value"]
            .fillna("")
            .astype(str)
            .str.strip()
            .str.upper()
        )
        return df

    def _read_transports(self) -> pd.DataFrame:
        df = pd.read_excel(self.transport_file, sheet_name="Sheet1")
        df["_revtrac_key"] = df["Rev-Trac request"].apply(
            self._normalize_revtrac_number
        )
        return df

    def _load_reference(self):
        return self._reference_df

    def _load_transports(self):
        return self._transport_df

    def get_revtrac_for_feature(
        self,
        issue_key: str,
        ritm: str | None = None,
        linked_issue_keys: list[str] | None = None,
    ):
        """
        Find RevTrac requests associated with a JIRA feature.

        Matching strategy:

        1. Search RevTrac reference export using the feature key.
        2. Search using the RITM.
        3. Search using linked child issue keys such as CMD/CTB.
        4. Combine all results.
        5. Remove duplicate RevTrac requests.
        6. Find all transports belonging to each RevTrac request,
           filtered to only those whose Short text contains one of
           the feature's lookup values (RITM / issue key / child
           keys).  If none match the Short text falls back to
           returning all transports for that RevTrac, because some
           RevTracs do not encode the RITM inside the transport
           description at all.
        """

        reference_df = self._load_reference()
        transport_df = self._load_transports()

        lookup_values = {
            self._normalize_reference_value(value)
            for value in [issue_key, ritm, *(linked_issue_keys or [])]
            if self._normalize_reference_value(value)
        }

        # ---------------------------------------------------------
        # Find references using feature, RITM, and linked issues
        # ---------------------------------------------------------

        if not lookup_values:
            return []

        matches = reference_df[
            reference_df["Ref Value"].isin(lookup_values)
        ].copy()

        # ---------------------------------------------------------
        # Collect unique RevTrac requests
        # ---------------------------------------------------------

        revtrac_numbers = []

        for value in matches["Rev-Trac request"]:

            normalized = self._normalize_revtrac_number(value)

            if normalized is not None:
                revtrac_numbers.append(normalized)

        # Remove duplicates while preserving order
        revtrac_numbers = list(dict.fromkeys(revtrac_numbers))

        revtrac_requests = []

        # ---------------------------------------------------------
        # Build RevTrac -> Transport hierarchy
        # ---------------------------------------------------------

        # Pre-compute normalised key on the matched rows once so
        # we can group by it cheaply instead of running .apply()
        # inside the loop (which would be O(n²)).
        matches = matches.copy()
        matches["_revtrac_key"] = matches["Rev-Trac request"].apply(
            self._normalize_revtrac_number
        )

        # ---------------------------------------------------------
        # Build RevTrac -> Transport hierarchy
        #
        # Two-pass approach:
        #
        # Pass 1 — build each RevTrac entry and record whether its
        #   transports were matched by Short text ("explicit") or fell
        #   back to showing all transports ("fallback").
        #
        # Pass 2 — if at least one RevTrac has explicit matches, drop
        #   all fallback RevTracs.  A fallback RevTrac whose Short text
        #   does not mention any of the feature's lookup values simply
        #   references this feature at the RevTrac level without having
        #   dedicated transports for it; the real transports live in
        #   the explicitly-matched RevTracs.
        # ---------------------------------------------------------

        staged = []   # list of (entry_dict, used_fallback)

        for revtrac_number in revtrac_numbers:

            # All reference rows belonging to this RevTrac
            revtrac_reference_rows = matches[
                matches["_revtrac_key"] == revtrac_number
            ]

            # All transports belonging to this RevTrac
            all_transports = transport_df[
                transport_df["_revtrac_key"] == revtrac_number
            ].copy()

            # Filter to only transports relevant to this feature.
            # _filter_transports_by_lookup also tells us whether it
            # had to fall back (returned the full set unchanged).
            filtered_transports, used_fallback = self._filter_transports_by_lookup(
                all_transports, lookup_values
            )

            transport_list = []

            for _, transport in filtered_transports.iterrows():

                transport_list.append({
                    "sequence": self._clean_value(
                        transport["Sequence"]
                    ),
                    "transport_number": self._clean_value(
                        transport["Transport number"]
                    ),
                    "category": self._clean_value(
                        transport["Category"]
                    ),
                    "short_text": self._clean_value(
                        transport["Short text"]
                    ),
                    "last_changed_by": self._clean_value(
                        transport["Last changed by"]
                    ),
                    "release_date": self._clean_value(
                        transport["Release Date"]
                    ),
                    "release_time": self._clean_value(
                        transport["Release Time"]
                    ),
                })

            # Use first reference row as the RevTrac metadata
            row = revtrac_reference_rows.iloc[0]

            staged.append((
                {
                    "revtrac": revtrac_number,

                    "project": self._clean_value(
                        row["Project"]
                    ),

                    "request_type": self._clean_value(
                        row["Request type"]
                    ),

                    "class": self._clean_value(
                        row["Class"]
                    ),

                    "team": self._clean_value(
                        row["Team"]
                    ),

                    "status": self._clean_value(
                        row["Status"]
                    ),

                    "title": self._clean_value(
                        row["Title"]
                    ),

                    "references": [
                        {
                            "ref_type": self._clean_value(
                                ref_row["Ref Type"]
                            ),
                            "ref_value": self._clean_value(
                                ref_row["Ref Value"]
                            ),
                            "ref_text": self._clean_value(
                                ref_row["Ref Text"]
                            ),
                        }
                        for _, ref_row in revtrac_reference_rows.iterrows()
                    ],

                    "transports": transport_list,
                },
                used_fallback,
            ))

        # Pass 2: if any RevTrac had explicit Short text matches,
        # drop fallback-only RevTracs (their TRs don't belong here).
        any_explicit = any(not fallback for _, fallback in staged)

        for entry, used_fallback in staged:
            if any_explicit and used_fallback:
                # This RevTrac has no dedicated transports for this
                # feature — skip it entirely.
                continue
            revtrac_requests.append(entry)

        return revtrac_requests

    @staticmethod
    def _filter_transports_by_lookup(
        transports_df,
        lookup_values: set,
    ) -> tuple:
        """
        Return (filtered_df, used_fallback) where:

        - filtered_df  is the subset of transports whose Short text
          contains at least one of the feature's lookup values (RITM,
          JIRA issue key, child keys such as CMD-xxx / CTB-xxx).
        - used_fallback is True when no transport matched any lookup
          value, meaning filtered_df == transports_df (the full set).

        The caller uses used_fallback to decide whether this RevTrac
        has dedicated transports for the feature.  If other RevTracs
        in the same result set did find matches, any fallback RevTrac
        is dropped entirely — it carries no dedicated TRs for this
        feature; its reference is at the RevTrac level only.

        The match is case-insensitive substring search, which mirrors
        how Short text is populated in practice:
          "99/220 RITM4456138_G_MTC_IDD_GBL_0078: Sales Order API"
          "500/50 DCRTB-437 CMD-1975 RITM4220316 DTW: MD1 ID"
        """
        if transports_df.empty or not lookup_values:
            # Empty DF — nothing to filter; treat as explicit (no TRs).
            return transports_df, False

        short_text_col = transports_df["Short text"].fillna("").str.upper()

        # Build a boolean mask: True for rows containing ANY lookup value
        mask = pd.Series(False, index=transports_df.index)
        for value in lookup_values:
            mask |= short_text_col.str.contains(value.upper(), regex=False)

        filtered = transports_df[mask]

        if not filtered.empty:
            return filtered, False   # explicit match — transports confirmed

        # Nothing matched: fall back to showing all transports and flag it
        return transports_df, True

    @staticmethod
    def _normalize_reference_value(value):

        if value is None:
            return ""

        if pd.isna(value):
            return ""

        return (
            str(value)
            .strip()
            .upper()
        )

    @staticmethod
    def _normalize_revtrac_number(value):

        if value is None or pd.isna(value):
            return None

        try:
            return int(float(value))
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _clean_value(value):

        if value is None or pd.isna(value):
            return None

        if isinstance(value, pd.Timestamp):
            return value.isoformat()

        return value