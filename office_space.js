// --- Define Grid Parameters ---
const startX = 50;
const startY = 50;
const standardOfficeWidth = 100;
const standardOfficeHeight = 100;
const xGap = 20;
const yGap = 30;
const officesPerRow = 6; // Adjusted to fit more offices potentially per row
const svgPadding = 50; // Padding around the layout in the SVG

// --- Global Data Structures ---
let floorLayouts = { 3: {}, 4: {} }; // Holds {roomId: {x, y}} for each floor
let floorOfficesData = { 3: {}, 4: {} }; // Intermediate data during CSV load
let floorOffices = { 3: [], 4: [] }; // Final D3 data arrays {id, x, y, w, h, occupants}
let currentFloor = 3; // Start by showing 3rd floor

// --- Room Lists (from previous steps) ---
const thirdFloorRooms = ['302', '303', '303A', '304', '305', '306', '310', '319', '322A', '323', '324', '325', '326', '328', '330', '330A', '331', '332', '333', '333A', '333B', '334', '335', '336', '337', '338', '339', '340', '370', '371', '372', '375', '375A', '376', '379', '381A', '382N-A'];
const fourthFloorRooms = ['402', '404', '405', '406', '407', '409', '412', '413', '414', '419', '420', '421', '423', '424', '425', '426', '427', '428', '429', '430', '431', '433', '434', '435', '436', '437', '438', '439', '460', '461B', '462', '463', '463A', '464', '465'];



// --- Modify drawOffices function ---
function drawOffices() {
    const officesToDraw = floorOffices[currentFloor]; // Get data for the active floor
    console.log(`Drawing ${officesToDraw.length} offices for Floor ${currentFloor}`);

    const officeGroups = svg.selectAll("g.office-group")
        .data(officesToDraw, d => d.id)
        .join(
            enter => { // Elements to add
                const g = enter.append("g")
                    // Dynamically set class based on occupancy
                    .attr("class", d => `office-group ${d.occupants && d.occupants.length > 0 ? "occupied" : ""}`)
                    .attr("transform", d => `translate(${d.x}, ${d.y})`)
                    .on("click", function(event, d) { showEditPopup(d); });

                // Append rect - it will inherit style based on parent 'g' classes
                g.append("rect")
                    .attr("class", "office") // Basic class, specific fill comes from parent 'g' class via CSS
                    .attr("x", 0).attr("y", 0)
                    .attr("width", d => d.width).attr("height", d => d.height);

                g.append("text") // Office ID
                    .attr("class", "id-text")
                    .attr("x", d => d.width / 2).attr("y", 15)
                    .text(d => d.id);

                g.each(function(d) { updateOccupantTextsMultiline(d3.select(this), d); });

                return g;
            },
            update => { // Elements to update
                update.attr("transform", d => `translate(${d.x}, ${d.y})`)
                    // Update classes in case occupancy changes
                    .attr("class", d => `office-group ${d.occupants && d.occupants.length > 0 ? "occupied" : ""}`);

                // Re-apply occupant text (no change needed here for background)
                update.each(function(d) { updateOccupantTextsMultiline(d3.select(this), d); });

                // Ensure rect class reflects occupancy (though fill is now mainly driven by group class)
                update.select("rect.office")
                     .classed("occupied", d => d.occupants && d.occupants.length > 0); // Keep this for potential other styles

                return update;
            },
            exit => exit.remove()
        );

    // Note: The explicit setting of 'office occupied' class on the rect might
    // become redundant if all styling is handled via the group + '.office' selectors,
    // but it doesn't hurt to leave it.
}

// --- Function to Calculate Layout Coordinates for a Floor ---
function calculateLayout(roomList, floorNum) {
    const layout = {};
    roomList.forEach((roomId, index) => {
        const col = index % officesPerRow;
        const row = Math.floor(index / officesPerRow);
        const x = startX + col * (standardOfficeWidth + xGap);
        const y = startY + row * (standardOfficeHeight + yGap);
        layout[roomId] = { x: x, y: y };
    });
    floorLayouts[floorNum] = layout; // Store calculated layout
}

// --- Calculate Layouts for Both Floors ---
calculateLayout(thirdFloorRooms, 3);
calculateLayout(fourthFloorRooms, 4);


// --- Helper function to convert M/D/YY or MM/DD/YY to YYYY-MM-DD ---
function formatDateForInput(dateString) { /* ... (keep unchanged) ... */
    if (!dateString || typeof dateString !== 'string') { return ""; } try { const parts = dateString.split('/'); if (parts.length !== 3) return ""; let month = parts[0].padStart(2, '0'); let day = parts[1].padStart(2, '0'); let year = parts[2]; if (year.length === 2) { year = '20' + year; } else if (year.length !== 4) { return ""; } return `${year}-${month}-${day}`; } catch (e) { console.error("Error parsing date:", dateString, e); return ""; }
}


// office-space/office_space.js

// ... (other code) ...

// --- Fetch data from the API ---
d3.json("/api/offices").then(apiData => {
    // Clear previous intermediate data (might not be needed if API is source of truth)
    // floorOfficesData = { 3: {}, 4: {} }; // Likely not needed anymore
    floorOffices = { 3: [], 4: [] }; // Reset final arrays

    // Process the data returned from the API (NEW STRUCTURE)
    for (const officeId in apiData) {
        const officeInfo = apiData[officeId]; // Contains occupants list
        const occupants = officeInfo.occupants;


        const floorNum = officeId.startsWith('3') ? 3 : officeId.startsWith('4') ? 4 : null;
        if (!floorNum) continue; // Skip if not 3rd or 4th floor

        const layout = floorLayouts[floorNum][officeId]; // Get layout for this floor/office
        if (!layout) {
            console.warn(`Office ID ${officeId} found in API data but not in predefined layout for floor ${floorNum}. Skipping.`);
            continue; // Skip if office isn't in our defined layout
        }

        // Prepare occupant data (mapping remains the same, just using 'occupants' array)
        const processedOccupants = occupants.map(occ => ({
            id: occ.occupant_id,
            name: occ.full_name,
            startDate: occ.start_date,
            endDate: occ.end_date,
            temporary: occ.temporary
        }));

        // Add to the final data structure for D3
        floorOffices[floorNum].push({
            id: officeId,
            x: layout.x,
            y: layout.y,
            width: standardOfficeWidth,
            height: standardOfficeHeight,
            occupants: processedOccupants

        });
    }

    // --- Optional: Handle offices from the layout that might NOT be in the API data ---
    // This logic might need adjustment depending on whether the API now includes empty offices
    // (based on the optional enhancement mentioned in the Python code).
    // If the API *only* returns offices present in the DB, you might still need
    // to add layout-only offices here, potentially without an area_name if it's not available.
    for (let floorNum of [3, 4]) {
        const layoutRooms = Object.keys(floorLayouts[floorNum]);
        const apiRooms = floorOffices[floorNum].map(o => o.id);
        layoutRooms.forEach(roomId => {
            if (!apiRooms.includes(roomId)) {
                 console.log(`Office ${roomId} is in layout but not in API data (likely empty or not in DB).`);
                // If you want to display empty offices from the layout with area colors,
                // you'd need to ensure the migration adds them OR replicate the
                // get_area_name logic in JS or pass it via another mechanism.
                // Simplest is ensuring they are in the DB via migrate_csv.py.
                // Example of adding without area color:
                 const layout = floorLayouts[floorNum][roomId];
                 floorOffices[floorNum].push({
                     id: roomId, x: layout.x, y: layout.y, width: standardOfficeWidth,
                     height: standardOfficeHeight, occupants: [] // No area name available here
                 });
            }
        });
         // Optional: Sort offices by ID within each floor
        floorOffices[floorNum].sort((a, b) => a.id.localeCompare(b.id, undefined, {numeric: true}));
    }


    // --- Display the initial floor ---
    displayFloor(currentFloor); // Show default floor (3rd)

}).catch(error => {
    console.error("Error fetching office data from API:", error);
    // Display an error message to the user on the page
    d3.select("body").insert("div", ":first-child")
        .attr("style", "background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; padding: 15px; margin: 10px; border-radius: 4px;")
        .html("<strong>Error:</strong> Could not load office data from the server. Please ensure the backend server is running and the database is initialized/migrated. <br><pre>" + error + "</pre>");
});

// ... (rest of office_space.js remains the same - drawOffices function correctly uses d.area_name)

// --- D3 Selections ---
const svg = d3.select("#office-layout");
const floorBtn3 = d3.select("#floor-btn-3");
const floorBtn4 = d3.select("#floor-btn-4");
// ... (rest of selections remain the same) ...
const editContainer = d3.select("#edit-container"); const editBackdrop = d3.select("#edit-backdrop"); const occupantListDiv = d3.select("#occupant-list"); const editFieldsDiv = d3.select("#edit-fields"); const editNameInput = d3.select("#edit-name"); const editStartDateInput = d3.select("#edit-start-date"); const editEndDateInput = d3.select("#edit-end-date"); const editTempCheckbox = d3.select("#edit-temp"); const dateFieldsDiv = d3.select("#date-fields"); const editModeLabel = d3.select("#edit-mode-label"); const saveOccupantButton = d3.select("#save-occupant-button"); const deleteOccupantButton = d3.select("#delete-occupant-button");

// --- State Variables ---
let currentOfficeData = null; // Data of the office being edited
let currentEditingOccupantIndex = -1;


// --- Function to Display a Specific Floor ---
function displayFloor(floorNum) {
    if (floorNum !== 3 && floorNum !== 4) return; // Basic validation

    currentFloor = floorNum;
    console.log("Displaying Floor:", currentFloor);

    // Update button active states
    floorBtn3.classed("active", currentFloor === 3);
    floorBtn4.classed("active", currentFloor === 4);

    // Adjust SVG size based on the selected floor's data
    const officesToDraw = floorOffices[currentFloor];
    if (!officesToDraw || officesToDraw.length === 0) {
         svg.attr("width", startX + svgPadding) // Minimal size if no offices
            .attr("height", startY + svgPadding);
          svg.selectAll("g.office-group").remove(); // Clear SVG
         return;
    }

    const maxX = d3.max(officesToDraw, d => d.x + d.width) || startX;
    const maxY = d3.max(officesToDraw, d => d.y + d.height) || startY;
    svg.attr("width", maxX + svgPadding)
       .attr("height", maxY + svgPadding);

    // Draw the offices for the current floor
    drawOffices();
}


// --- Draw Offices for the CURRENT floor ---
// (Renamed from initializeOffices, uses global currentFloor)
function drawOffices() {
    const officesToDraw = floorOffices[currentFloor]; // Get data for the active floor

    console.log(`Drawing ${officesToDraw.length} offices for Floor ${currentFloor}`);

    const officeGroups = svg.selectAll("g.office-group")
        // Use data for the current floor, key by ID
        .data(officesToDraw, d => d.id)
        .join(
            enter => { // Elements to add
                const g = enter.append("g")
                    .attr("class", d => `office-group ${d.occupants && d.occupants.length > 0 ? "occupied" : ""}`)
                    .attr("transform", d => `translate(${d.x}, ${d.y})`)
                    .on("click", function(event, d) { showEditPopup(d); });

                g.append("rect")
                    .attr("class", "office")
                    .attr("x", 0).attr("y", 0)
                    .attr("width", d => d.width).attr("height", d => d.height);

                g.append("text") // Office ID
                    .attr("class", "id-text")
                    .attr("x", d => d.width / 2).attr("y", 15)
                    .text(d => d.id);

                // Add initial occupant text (will be populated by update)
                 g.each(function(d) { updateOccupantTextsMultiline(d3.select(this), d); });

                return g;
            },
            update => { // Elements to update (e.g., if data changes but office exists)
                 // Update position if needed (though layout is fixed now)
                update.attr("transform", d => `translate(${d.x}, ${d.y})`);
                 // Update occupants
                update.each(function(d) { updateOccupantTextsMultiline(d3.select(this), d); });
                 // Update classes in case occupancy changes
                update.attr("class", d => `office-group ${d.occupants && d.occupants.length > 0 ? "occupied" : ""}`);
                return update;
            },
            exit => exit.remove() // Remove groups for offices not on this floor
        );

    // Update styles (like occupied class) for all groups (enter + update)
    officeGroups.select("rect.office")
         .attr("class", d => d.occupants.length > 0 ? "office occupied" : "office");
}

function updateOccupantTextsMultiline(groupSelection, officeData) {
    const occupantsData = officeData.occupants;
    const boxWidth = officeData.width; // Standard width
    const boxCenterX = boxWidth / 2; // Calculate center X
    // Keep padding for width calculation, but not for x positioning
    const padding = 5;
    const availableWidth = boxWidth - (2 * padding);
    const nameLineHeight = 11;
    const dateLineHeight = 10;
    const nameTopMargin = 28;
    const spaceBetweenOccupants = 5;

    groupSelection.selectAll("g.occupant-info").remove();
    let currentY = nameTopMargin;

    occupantsData.forEach((occupant, index) => {
        const occupantGroup = groupSelection.append("g")
            .attr("class", "occupant-info");

        // --- 1. Add and Wrap Name ---
        const nameText = occupantGroup.append("text")
            .attr("class", "occupant-text occupant-name")
             // *** Set X to center ***
            .attr("x", boxCenterX);

        // Call wrapText helper, passing boxCenterX
        let nameLines = wrapText(nameText, occupant.name || "Unnamed", availableWidth, boxCenterX, currentY, nameLineHeight);
        currentY += nameLines * nameLineHeight;

        // --- 2. Add Dates if Temporary ---
        if (occupant.temporary) {
            let dateString = "";
            const start = occupant.startDate; const end = occupant.endDate;
            if (start && end) { dateString = `(${start} → ${end})`; } else if (start) { dateString = `(From ${start})`; } else if (end) { dateString = `(Until ${end})`; } else { dateString = `(Temporary)`; }

            if (dateString) {
                const dateText = occupantGroup.append("text")
                     .attr("class", "occupant-text occupant-dates")
                      // *** Set X to center ***
                     .attr("x", boxCenterX);

                // Call wrapText helper, passing boxCenterX
                let dateLines = wrapText(dateText, dateString, availableWidth, boxCenterX, currentY, dateLineHeight);
                currentY += dateLines * dateLineHeight;
            }
        }
        currentY += spaceBetweenOccupants;
    });
}

// --- Helper function for text wrapping (MODIFIED for centering) ---
// Now takes centerX instead of padding for x attribute
function wrapText(textElement, text, width, centerX, startY, lineHeight) {
    textElement.text(null);
    const words = text.split(/\s+/).reverse();
    let word;
    let line = [];
    let lineNumber = 0;

    // Create the first tspan, setting X to centerX
    let tspan = textElement.append("tspan")
        .attr("x", centerX) // Use centerX
        .attr("y", startY)
        .attr("dy", "0em");

    while (word = words.pop()) {
        line.push(word);
        tspan.text(line.join(" "));
        // Use getComputedTextLength for wrapping check (more accurate)
        if (tspan.node().getComputedTextLength() > width && line.length > 1) {
            line.pop();
            tspan.text(line.join(" "));
            line = [word];
            lineNumber++;
            // Add new tspan, setting X to centerX
            tspan = textElement.append("tspan")
                .attr("x", centerX) // Use centerX
                .attr("y", startY)
                .attr("dy", `${lineNumber * lineHeight}px`)
                .text(word);
        }
    }
    return lineNumber + 1;
}

// --- formatOccupantText (Not directly used by SVG drawing anymore) ---
function formatOccupantText(occupant) { return occupant.name || "Unnamed"; }


// --- Edit Popup Logic (Needs minor change in save/delete to redraw CURRENT floor) ---

function showEditPopup(officeData) { /* ... (keep unchanged) ... */
    currentOfficeData = officeData; currentEditingOccupantIndex = -1; d3.select("#edit-office-id").text(`Edit Office ${officeData.id}`); populateOccupantList(officeData.occupants); editFieldsDiv.style("display", "none"); deleteOccupantButton.style("display", "none"); editBackdrop.style("display", "block"); editContainer.style("display", "block");
}

function formatOccupantListText(occupant) { /* ... (keep unchanged) ... */
    let text = occupant.name || "Unnamed"; if (occupant.temporary) { const start = occupant.startDate; const end = occupant.endDate; if (start && end) text += ` (Temp: ${start} → ${end})`; else if (start) text += ` (Temp: From ${start})`; else if (end) text += ` (Temp: Until ${end})`; else text += ` (Temp)`; } return text;
}

function populateOccupantList(occupants) { /* ... (keep unchanged) ... */
    occupantListDiv.html(""); if (occupants.length === 0) { occupantListDiv.append("p").text("No occupants assigned."); } else { occupants.forEach((occ, index) => { const item = occupantListDiv.append("div").attr("class", "occupant-item"); item.append("span").text(formatOccupantListText(occ)); item.append("button").text("Edit").on("click", () => prepareEditOccupant(index)); }); }
}

function prepareEditOccupant(index) { /* ... (keep unchanged) ... */
    currentEditingOccupantIndex = index; const occupant = currentOfficeData.occupants[index]; editModeLabel.text(`Editing: ${occupant.name}`); editNameInput.node().value = occupant.name || ""; editTempCheckbox.property("checked", occupant.temporary || false); editStartDateInput.node().value = occupant.startDate || ""; editEndDateInput.node().value = occupant.endDate || ""; toggleDateFields(occupant.temporary || false); editFieldsDiv.style("display", "block"); deleteOccupantButton.style("display", "inline-block"); saveOccupantButton.text("Save Changes"); deleteOccupantButton.style.display = 'inline-block';
}

function prepareAddOccupant() { /* ... (keep unchanged) ... */
     currentEditingOccupantIndex = -1; editModeLabel.text("Add New Occupant"); editNameInput.node().value = ""; editTempCheckbox.property("checked", false); editStartDateInput.node().value = ""; editEndDateInput.node().value = ""; toggleDateFields(false); editFieldsDiv.style("display", "block"); deleteOccupantButton.style("display", "none"); saveOccupantButton.text("Add Occupant"); editNameInput.node().focus();
}

function saveOccupantEdit() {
    // Find the correct office data within the correct floor's array
    const floorData = floorOffices[currentFloor];
    const officeIndex = floorData.findIndex(o => o.id === currentOfficeData.id);
    if (officeIndex === -1) return; // Should not happen if popup opened

    // Get data directly from the main floor array
    let targetOfficeData = floorData[officeIndex];

    const name = editNameInput.node().value.trim();
    if (!name) { alert("Occupant name cannot be empty."); return; }
    const isTemporary = editTempCheckbox.property("checked");
    const startDate = editStartDateInput.node().value; const endDate = editEndDateInput.node().value;
    const updatedOccupant = { name: name, temporary: isTemporary, startDate: isTemporary ? startDate : "", endDate: isTemporary ? endDate : "" };
    if (updatedOccupant.endDate) { updatedOccupant.temporary = true; } if (!isTemporary && !updatedOccupant.endDate) { updatedOccupant.temporary = false; }

    if (currentEditingOccupantIndex > -1) {
        // Update existing occupant in the main floor array
        targetOfficeData.occupants[currentEditingOccupantIndex] = updatedOccupant;
    } else {
        // Add new occupant to the main floor array
        targetOfficeData.occupants.push(updatedOccupant);
    }

    // --- Redraw the current floor to reflect changes ---
    drawOffices();

    // Refresh the list in the popup and hide fields
    // Note: populateOccupantList needs the potentially updated occupant list
    populateOccupantList(targetOfficeData.occupants);
    editFieldsDiv.style("display", "none");
    currentEditingOccupantIndex = -1;
}

function cancelOccupantEdit() { /* ... (keep unchanged) ... */
     editFieldsDiv.style("display", "none"); currentEditingOccupantIndex = -1;
}

function deleteCurrentOccupant() {
    const floorData = floorOffices[currentFloor];
    const officeIndex = floorData.findIndex(o => o.id === currentOfficeData.id);
    if (officeIndex === -1 || currentEditingOccupantIndex < 0) return;

    let targetOfficeData = floorData[officeIndex];
    const occupantToDelete = targetOfficeData.occupants[currentEditingOccupantIndex];

    if (confirm(`Are you sure you want to remove ${occupantToDelete.name}?`)) {
        // Remove the occupant from the main floor array
        targetOfficeData.occupants.splice(currentEditingOccupantIndex, 1);

        // --- Redraw the current floor ---
        drawOffices();

        // Refresh list and hide fields
        populateOccupantList(targetOfficeData.occupants);
        editFieldsDiv.style("display", "none");
        currentEditingOccupantIndex = -1;
    }
}

function closeEditPopup() { /* ... (keep unchanged) ... */
    editBackdrop.style("display", "none"); editContainer.style("display", "none"); currentOfficeData = null; currentEditingOccupantIndex = -1;
}

function toggleDateFields(isTemporary) { /* ... (keep unchanged) ... */
    dateFieldsDiv.style("display", isTemporary ? "block" : "none");
}

editTempCheckbox.on("change", function() { /* ... (keep unchanged) ... */
    toggleDateFields(this.checked);
});

editBackdrop.on("click", closeEditPopup);