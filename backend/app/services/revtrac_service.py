from pathlib import Path

import pandas as pd


class RevTracService:

    def __init__(self):
        # revtrac_service.py
        #   -> services
        #   -> app
        #   -> backend
        #   -> traceability-dashboard
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

            self._reference_df["Ref Value"] = (
                self._reference_df["Ref Value"]
                .fillna("")
                .astype(str)
                .str.strip()
            )

        return self._reference_df

    def _load_transports(self):
        if self._transport_df is None:
            self._transport_df = pd.read_excel(
                self.transport_file,
                sheet_name="Sheet1"
            )

        return self._transport_df

    def get_revtrac_for_feature(self, issue_key: str):
        """
        Find RevTrac requests associated with a JIRA feature.

        V1 uses the direct DCRTB reference from the
        RevTrac Reference export.
        """

        reference_df = self._load_reference()
        transport_df = self._load_transports()

        issue_key = issue_key.strip().upper()

        matches = reference_df[
            reference_df["Ref Value"]
            .str.upper()
            .eq(issue_key)
        ]

        revtrac_requests = []

        for _, row in matches.iterrows():

            revtrac_number = row["Rev-Trac request"]

            if pd.isna(revtrac_number):
                continue

            try:
                revtrac_number = int(revtrac_number)
            except (ValueError, TypeError):
                continue

            transports = transport_df[
                transport_df["Rev-Trac request"] == revtrac_number
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
                "references": self._clean_value(
                    row["Ref Text"]
                ),
                "transports": transport_list,
            })

        return revtrac_requests

    @staticmethod
    def _clean_value(value):
        if pd.isna(value):
            return None

        if isinstance(value, pd.Timestamp):
            return value.isoformat()

        return value