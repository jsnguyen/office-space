# office-space/app.py
import sqlite3
import os
from flask import Flask, request, jsonify, render_template, g

# --- Configuration ---
DATABASE = 'mydatabase.db' # Name of the SQLite database file

# --- Flask App Setup ---
app = Flask(__name__, static_folder='.', static_url_path='') # Serve static files from root

# --- Database Helper Functions ---
def get_db():
    """Opens a new database connection if there is none yet for the current application context."""
    if 'db' not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row # Return rows that behave like dictionaries
    return g.db

@app.teardown_appcontext
def close_db(error):
    """Closes the database again at the end of the request."""
    db = g.pop('db', None)
    if db is not None:
        db.close()

def init_db_schema():
    """Defines the schema for the office assignments table."""
    return """
    DROP TABLE IF EXISTS office_assignments;
    CREATE TABLE office_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        office_id TEXT NOT NULL,
        full_name TEXT NOT NULL,
        appointment_type TEXT,
        start_date TEXT, -- Store dates as ISO 8601 strings (YYYY-MM-DD)
        end_date TEXT,   -- Store dates as ISO 8601 strings (YYYY-MM-DD)
        is_temporary BOOLEAN DEFAULT FALSE,

        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    -- Optional: Index for faster lookups by office_id
    CREATE INDEX IF NOT EXISTS idx_office_id ON office_assignments (office_id);
    """

@app.cli.command('init-db')
def init_db_command():
    """Clear existing data and create new tables via command line."""
    if os.path.exists(DATABASE):
         os.remove(DATABASE) # Remove old db if exists before initializing
         print(f"Removed existing database: {DATABASE}")

    conn = sqlite3.connect(DATABASE)
    conn.executescript(init_db_schema())
    conn.commit()
    conn.close()
    print('Initialized the database with office_assignments table.')

# --- HTML Route ---
@app.route('/')
def home():
    """Serves the main office space HTML page."""
    # Check if DB exists, provide instructions if not
    if not os.path.exists(DATABASE):
        return """
        <h1>Database Not Found</h1>
        <p>The database file '{DATABASE}' does not exist.</p>
        <p>Please run the following commands in your terminal:</p>
        <pre>
flask init-db
python migrate_csv.py assignments_dates.csv
        </pre>
        <p>Then refresh this page.</p>
        """.format(DATABASE=DATABASE), 500 # Internal Server Error status

    # Check if the table exists, provide instructions if not
    try:
        db = get_db()
        db.execute("SELECT 1 FROM office_assignments LIMIT 1")
    except sqlite3.OperationalError as e:
         if "no such table" in str(e):
             return """
             <h1>Table Not Found</h1>
             <p>The database exists, but the 'office_assignments' table is missing.</p>
             <p>Please run the following commands in your terminal:</p>
             <pre>
flask init-db
python migrate_csv.py assignments_dates.csv
             </pre>
             <p>Then refresh this page.</p>
             """.format(DATABASE=DATABASE), 500
         else:
             raise # Re-raise other operational errors
    except Exception as e:
        # Catch other potential connection errors, though get_db should handle DB missing
        return f"<h1>Error Connecting to Database</h1><p>{e}</p>", 500

    # If DB and table exist, serve the HTML
    return render_template('office_space.html')


# --- JSON API Routes ---
# office-space/app.py

# ... (imports and other functions remain the same) ...

@app.route('/api/offices', methods=['GET'])
def get_offices_api():
    """API endpoint to get all office assignments, grouped by office ID."""
    db = get_db()
    # Use a dictionary to build the response structure
    offices_response = {}
    try:
        cur = db.execute('''
                        SELECT id, office_id, full_name, appointment_type, start_date, end_date, is_temporary
                        FROM office_assignments
                        ORDER BY office_id, id
                        ''')
        rows = cur.fetchall()

        # Process rows to build the desired structure
        for row in rows:
            office_id = row['office_id']

            # If this office_id is not yet in our response, initialize it
            if office_id not in offices_response:
                offices_response[office_id] = {

                    "occupants": []
                }

            # Prepare occupant details
            occupant_dict = {
                "occupant_id": row['id'], # Use 'id' from DB as 'occupant_id'
                "full_name": row['full_name'],
                "appointment_type": row['appointment_type'],
                "start_date": row['start_date'],
                "end_date": row['end_date'],
                "temporary": bool(row['is_temporary'])
                # Note: We don't need area_name inside each occupant anymore
            }
            offices_response[office_id]["occupants"].append(occupant_dict)

        # TODO (Optional Enhancement): Add empty offices from layout definitions
        # if they weren't in the database. This requires access to the room lists
        # (thirdFloorRooms, fourthFloorRooms) here or modifying the migration
        # script to ensure all rooms exist in the DB, potentially with NULL area_name.
        # Example:
        # all_defined_rooms = set(thirdFloorRooms + fourthFloorRooms) # Needs access to these lists
        # for room_id in all_defined_rooms:
        #    if room_id not in offices_response:
        #        # Need a way to get area_name for empty rooms if migration didn't add them
        #        # area = get_area_logic_here(room_id) # Requires repeating or importing logic
        #        offices_response[room_id] = {"occupants": []}

        return jsonify(offices_response) # Return the new structure

    except sqlite3.OperationalError as e:
         if "no such table" in str(e):
              return jsonify({"error": "Database not initialized. Run 'flask init-db' and migration script."}), 500
         else:
              app.logger.error(f"Database error fetching offices: {e}")
              return jsonify({"error": "Database error", "details": str(e)}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error fetching offices: {e}")
        return jsonify({"error": "An unexpected error occurred"}), 500


@app.route('/api/offices/<string:office_id>/occupants', methods=['POST'])
def add_occupant_api(office_id):
    """API endpoint to add a new occupant to a specific office."""
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    full_name = data.get('name')
    appointment_type = data.get('appointment_type', None) # Optional for now
    start_date = data.get('startDate') # Expecting<x_bin_398>-MM-DD or empty/null
    end_date = data.get('endDate')     # Expecting<x_bin_398>-MM-DD or empty/null
    is_temporary = data.get('temporary', False)

    if not full_name:
        return jsonify({"error": "Missing 'name' field"}), 400
    if not office_id:
        return jsonify({"error": "Missing 'office_id' in URL"}), 400 # Should be caught by Flask routing

    # Ensure dates are null if empty strings
    start_date = start_date if start_date else None
    end_date = end_date if end_date else None

    # Infer temporary if end_date is present, unless explicitly set otherwise
    if end_date and not is_temporary:
        is_temporary = True
    if not is_temporary: # Clear dates if not temporary
        start_date = None
        end_date = None

    db = get_db()
    try:
        cursor = db.execute('''
            INSERT INTO office_assignments
            (office_id, full_name, appointment_type, start_date, end_date, is_temporary)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', [office_id, full_name, appointment_type, start_date, end_date, is_temporary])
        db.commit()
        new_occupant_id = cursor.lastrowid

        # Fetch the newly created occupant to return it
        cur = db.execute('''
            SELECT id, office_id, full_name, appointment_type, start_date, end_date, is_temporary
            FROM office_assignments WHERE id = ?
            ''', [new_occupant_id])
        new_occupant_row = cur.fetchone()
        if new_occupant_row:
            new_occupant = dict(new_occupant_row)
            new_occupant['temporary'] = bool(new_occupant_row['is_temporary'])
            new_occupant['occupant_id'] = new_occupant.pop('id') # Rename id key
            return jsonify({"message": "Occupant added successfully", "occupant": new_occupant}), 201 # 201 Created status
        else:
             # Should not happen if insert succeeded, but handle defensively
             return jsonify({"message": "Occupant added, but could not retrieve details."}), 200

    except sqlite3.Error as e:
        db.rollback()
        app.logger.error(f"Database error adding occupant: {e}")
        return jsonify({"error": "Database error", "details": str(e)}), 500
    except Exception as e:
        db.rollback()
        app.logger.error(f"Unexpected error adding occupant: {e}")
        return jsonify({"error": "An unexpected error occurred"}), 500


@app.route('/api/occupants/<int:occupant_id>', methods=['PUT'])
def update_occupant_api(occupant_id):
    """API endpoint to update an existing occupant's details."""
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    full_name = data.get('name')
    # You could add appointment_type update here if needed
    start_date = data.get('startDate')
    end_date = data.get('endDate')
    is_temporary = data.get('temporary', None) # Use None to detect if it was sent

    if not full_name:
        return jsonify({"error": "Missing 'name' field"}), 400

    # Ensure dates are null if empty strings
    start_date = start_date if start_date else None
    end_date = end_date if end_date else None

    # Determine the final temporary status
    if is_temporary is None: # If not provided, infer from dates
         final_temporary = bool(start_date or end_date) # Temporary if either date is set
    else:
        final_temporary = bool(is_temporary)

    # Clear dates if not temporary
    if not final_temporary:
        start_date = None
        end_date = None

    db = get_db()
    try:
        # First check if occupant exists
        cur_check = db.execute('SELECT id FROM office_assignments WHERE id = ?', [occupant_id])
        if not cur_check.fetchone():
             return jsonify({"error": "Occupant not found"}), 404

        cursor = db.execute('''
            UPDATE office_assignments
            SET full_name = ?, start_date = ?, end_date = ?, is_temporary = ?
            WHERE id = ?
        ''', [full_name, start_date, end_date, final_temporary, occupant_id])

        if cursor.rowcount == 0:
            # This case should be caught by the check above, but handle just in case
            return jsonify({"error": "Occupant not found or no change detected"}), 404

        db.commit()

        # Fetch the updated occupant to return it
        cur = db.execute('''
             SELECT id, office_id, full_name, appointment_type, start_date, end_date, is_temporary
             FROM office_assignments WHERE id = ?
             ''', [occupant_id])
        updated_occupant_row = cur.fetchone()
        if updated_occupant_row:
            updated_occupant = dict(updated_occupant_row)
            updated_occupant['temporary'] = bool(updated_occupant_row['is_temporary'])
            updated_occupant['occupant_id'] = updated_occupant.pop('id') # Rename id key
            return jsonify({"message": "Occupant updated successfully", "occupant": updated_occupant}), 200
        else:
             return jsonify({"error": "Update successful but failed to retrieve updated record"}), 500


    except sqlite3.Error as e:
        db.rollback()
        app.logger.error(f"Database error updating occupant {occupant_id}: {e}")
        return jsonify({"error": "Database error", "details": str(e)}), 500
    except Exception as e:
        db.rollback()
        app.logger.error(f"Unexpected error updating occupant {occupant_id}: {e}")
        return jsonify({"error": "An unexpected error occurred"}), 500


@app.route('/api/occupants/<int:occupant_id>', methods=['DELETE'])
def delete_occupant_api(occupant_id):
    """API endpoint to delete an occupant."""
    db = get_db()
    try:
        # First check if occupant exists
        cur_check = db.execute('SELECT id FROM office_assignments WHERE id = ?', [occupant_id])
        if not cur_check.fetchone():
             return jsonify({"error": "Occupant not found"}), 404

        cursor = db.execute('DELETE FROM office_assignments WHERE id = ?', [occupant_id])

        if cursor.rowcount == 0:
             # Should be caught by check above
             return jsonify({"error": "Occupant not found"}), 404

        db.commit()
        return jsonify({"message": "Occupant deleted successfully"}), 200

    except sqlite3.Error as e:
        db.rollback()
        app.logger.error(f"Database error deleting occupant {occupant_id}: {e}")
        return jsonify({"error": "Database error", "details": str(e)}), 500
    except Exception as e:
        db.rollback()
        app.logger.error(f"Unexpected error deleting occupant {occupant_id}: {e}")
        return jsonify({"error": "An unexpected error occurred"}), 500


# --- Run the App ---
if __name__ == '__main__':
    # Create static directory if it doesn't exist (though now serving from root)
    # if not os.path.exists('static'):
    #    os.makedirs('static')
    #    print("Created 'static' directory.") # No longer strictly needed if using static_folder='.'

    port = 4999 # You can change this port if needed
    print(f"Starting Flask server on http://127.0.0.1:{port}")
    print(f"Using database: {DATABASE}")
    print("Ensure the database is initialized and migrated:")
    print("1. Run 'flask init-db'")
    print("2. Run 'python migrate_csv.py assignments_dates.csv' (after updating migrate_csv.py)")
    # Use host='0.0.0.0' to make it accessible on your network
    app.run(host='0.0.0.0', port=port, debug=True) # Keep debug=True for development