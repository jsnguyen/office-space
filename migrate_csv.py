# office-space/migrate_csv.py
import csv
import sqlite3
import sys
import os
from datetime import datetime


# --- Configuration and Helper functions remain the same ---
DATABASE = 'mydatabase.db'
EXPECTED_HEADERS_MAP = {
    'room number': 'office_id',
    'full name': 'full_name',
    'appointment type': 'appointment_type',
    'start date': 'start_date',
    'end date': 'end_date'
}
ESSENTIAL_DB_COLUMNS = ['office_id', 'full_name']
CSV_HAS_HEADER = True
CSV_ENCODING = 'utf-8'

def parse_and_format_date(date_str):
    # (Keep the same function)
    if not date_str or not date_str.strip(): return None
    date_str = date_str.strip()
    formats_to_try = ['%m/%d/%y', '%m/%d/%Y', '%Y-%m-%d']
    for fmt in formats_to_try:
        try: return datetime.strptime(date_str, fmt).strftime('%Y-%m-%d')
        except ValueError: continue
    print(f"Warning: Could not parse date '{date_str}'. Skipping date.")
    return None

def migrate_data(csv_filepath):
    # (Initial checks remain the same)
    if not os.path.exists(DATABASE): print(f"Error: DB '{DATABASE}' not found."); return
    print(f"Attempting migration from: {csv_filepath}")
    print(f"Into table 'office_assignments' in db: {DATABASE}")
    inserted_count, skipped_count, processed_rows = 0, 0, 0
    conn = None
    try:
        conn = sqlite3.connect(DATABASE)
        cursor = conn.cursor()
        try: cursor.execute("SELECT 1 FROM office_assignments LIMIT 1")
        except sqlite3.OperationalError as e:
            if "no such table" in str(e): print(f"Error: Table missing. Run 'flask init-db'."); return
            else: raise

        with open(csv_filepath, mode='r', newline='', encoding=CSV_ENCODING) as csvfile:
            if not CSV_HAS_HEADER: print("Error: Script requires headers."); return

            csvreader = csv.DictReader(csvfile)
            raw_fieldnames = csvreader.fieldnames
            if not raw_fieldnames: print("Error: Could not read headers."); return

            # --- CORRECTED HEADER PROCESSING ---
            actual_headers_lower = {} # Map: lowercase_header -> original_header (with BOM if present)
            processed_headers_for_display = [] # Just for printing clearly
            for i, header in enumerate(raw_fieldnames):
                if header is None: continue
                original_header_stripped = header.strip() # Store the key exactly as DictReader provides it (stripped)
                processed_header_lower = original_header_stripped.lower()

                # Remove BOM only for the lowercase key lookup if present on first header
                if i == 0 and processed_header_lower.startswith('\ufeff'):
                    processed_header_lower = processed_header_lower[1:]
                    print(f"Note: Removed BOM from first header key for matching: '{header}'")

                # Store map: lowercase_cleaned_key -> original_stripped_key (potentially with BOM)
                actual_headers_lower[processed_header_lower] = original_header_stripped
                processed_headers_for_display.append(processed_header_lower) # Add cleaned version for display
            # --- END CORRECTED HEADER PROCESSING ---

            print(f"Processed CSV Headers (lowercase keys used for mapping): {processed_headers_for_display}")

            # (Header warning checks remain the same, using actual_headers_lower keys)
            found_headers_map = {}
            missing_expected_headers = []
            for expected_lower, db_col in EXPECTED_HEADERS_MAP.items():
                 # Use the processed lowercase keys for checking existence
                if expected_lower in actual_headers_lower:
                    # Store the map: expected_lower -> original_header_name (value from actual_headers_lower)
                    found_headers_map[expected_lower] = actual_headers_lower[expected_lower]
                else:
                    missing_expected_headers.append(expected_lower)

            if missing_expected_headers:
                 print("\n--- Header Warnings ---")
                 # (Warning print logic remains the same)
                 print("Warning: The following expected headers were NOT found (using lowercase):")
                 for h in missing_expected_headers: print(f" - '{h}' (needed for DB column '{EXPECTED_HEADERS_MAP[h]}')")
                 print("Will proceed using defaults for missing optional columns.")
                 print("---------------------\n")

            missing_essential = False
            for db_col in ESSENTIAL_DB_COLUMNS:
                 expected_key = next((k for k, v in EXPECTED_HEADERS_MAP.items() if v == db_col), None)
                 # Check if the *lowercase* key exists in the map we built
                 if expected_key not in actual_headers_lower: # Check against the keys derived from file
                      print(f"Error: Essential header '{expected_key}' (for DB column '{db_col}') is missing. Cannot proceed.")
                      missing_essential = True
            if missing_essential: return

            processed_rows += 1

            for row_number, row in enumerate(csvreader, start=2):
                processed_rows += 1
                try:
                    # Get the actual header key (original case, potentially with BOM) from the map
                    room_header_key = found_headers_map.get('room number')
                    name_header_key = found_headers_map.get('full name')

                    # Extract data using the correct key
                    office_id_val = row.get(room_header_key, '').strip() if room_header_key else ''
                    full_name_val = row.get(name_header_key, '').strip() if name_header_key else ''

                    # Essential data validation
                    if not office_id_val or not full_name_val:
                        print(f"Skipping row {row_number}: Missing essential data (Room Number or Full Name). Row data: {row}")
                        skipped_count += 1
                        continue

                    # Extract optional data
                    appt_type_header_key = found_headers_map.get('appointment type')
                    start_date_header_key = found_headers_map.get('start date')
                    end_date_header_key = found_headers_map.get('end date')
                    appt_type_val = row.get(appt_type_header_key, '').strip() if appt_type_header_key else ''
                    start_date_str = row.get(start_date_header_key, '').strip() if start_date_header_key else ''
                    end_date_str = row.get(end_date_header_key, '').strip() if end_date_header_key else ''

                    # Parse dates
                    start_date_iso = parse_and_format_date(start_date_str)
                    end_date_iso = parse_and_format_date(end_date_str)
                    is_temporary = bool(end_date_iso)


                    # Essential data validation (remains the same)
                    if not office_id_val or not full_name_val:
                        # ... (skip logic remains the same)
                        continue

                    # ... (existing code to parse dates, etc.)

                    # Insert data - MODIFIED statement and parameters
                    cursor.execute('''
                        INSERT INTO office_assignments
                        (office_id, full_name, appointment_type, start_date, end_date, is_temporary)
                        VALUES (?, ?, ?, ?, ?, ?)
                    ''', (office_id_val, full_name_val, appt_type_val, start_date_iso, end_date_iso, is_temporary)) # Removed area_name_val
                    inserted_count += 1

                except Exception as e:
                    print(f"Error processing row {row_number}: {row} - Error: {e}")
                    skipped_count += 1

        # (Commit, Summary, and Finally block remain the same)
        conn.commit()
        print("\n--- Migration Summary ---")
        print(f"Processed {processed_rows} rows (including header).")
        print(f"Successfully inserted {inserted_count} entries into 'office_assignments'.")
        print(f"Skipped {skipped_count} rows due to errors or missing essential data.")
        if missing_expected_headers: print(f"Note: Warnings were issued for missing headers: {missing_expected_headers}")

    except FileNotFoundError: print(f"\nError: CSV file not found at '{csv_filepath}'")
    except sqlite3.Error as e: print(f"\nDatabase error: {e}"); conn.rollback() if conn else None
    except Exception as e: print(f"\nAn unexpected error occurred: {e}"); conn.rollback() if conn else None
    finally:
        if conn: conn.close(); print("Database connection closed.")


# --- Main execution block ---
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("\nUsage: python migrate_csv.py <path_to_your_csv_file.csv>")
        print(f"Example: python migrate_csv.py {os.path.join('.', 'assignments_dates.csv')}")
        sys.exit(1)
    csv_file_to_migrate = sys.argv[1]
    migrate_data(csv_file_to_migrate)