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

        self._reference_df = None
        self._transport_df = None

    def _load_reference(self):
        if self._reference_df is None:
            self._reference_df = pd.read_excel(
                self.reference_file,
                sheet_name="Sheet1"
            )

            # Normalize reference values once
            self._reference_df["Ref Value"] = (
                self._reference_df["Ref Value"]
                .fillna("")
                .astype(str)
                .str.strip()
                .str.upper()
            )

        return self._reference_df

    def _load_transports(self):
        if self._transport_df is None:
            self._transport_df = pd.read_excel(
                self.transport_file,
                sheet_name="Sheet1"
            )

            # Normalize RevTrac request number
            self._transport_df["_revtrac_key"] = (
                self._transport_df["Rev-Trac request"]
                .apply(self._normalize_revtrac_number)
            )

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
        6. Find all transports belonging to each RevTrac request.
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

        for revtrac_number in revtrac_numbers:

            # All reference rows belonging to this RevTrac
            revtrac_reference_rows = matches[
                matches["_revtrac_key"] == revtrac_number
            ]

            # All transports belonging to this RevTrac
            transports = transport_df[
                transport_df["_revtrac_key"] == revtrac_number
            ].copy()

            transport_list = []

            for _, transport in transports.iterrows():

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

            revtrac_requests.append({
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
            })

        return revtrac_requests

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