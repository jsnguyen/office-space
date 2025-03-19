const offices = [
    { id: 301, x: 50, y: 50, width: 100, height: 100, occupant: "Alice" },
    { id: 302, x: 200, y: 50, width: 100, height: 100, occupant: "Bob" },
    { id: 303, x: 350, y: 50, width: 100, height: 100, occupant: "Charlie" },
    { id: 304, x: 50, y: 200, width: 100, height: 100, occupant: "David" },
    { id: 305, x: 200, y: 200, width: 100, height: 100, occupant: "Eve" },
    { id: 306, x: 350, y: 200, width: 100, height: 100, occupant: "Frank" }
];

const svg = d3.select("#office-layout");
const inputBox = d3.select("#edit-input");
const editContainer = d3.select("#edit-container");
let currentOffice = null;

// Create office rectangles
const officeRects = svg.selectAll("g")
    .data(offices)
    .enter()
    .append("g") // Group to keep rect & text together
    .attr("class", "office-group")
    .on("click", function(event, d) {
        showEditPopup(d, this);
    });

// Create office rectangles
officeRects.append("rect")
    .attr("class", d => d.occupant ? "office occupied" : "office")
    .attr("x", d => d.x)
    .attr("y", d => d.y)
    .attr("width", d => d.width)
    .attr("height", d => d.height);

// Append text (occupant name & dates)
officeRects.append("text")
    .attr("x", d => d.x + d.width / 2)
    .attr("y", d => d.y + d.height / 2 - 10)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("class", "office-text")
    .text(d => `${d.occupant}`);

// Append text for start & end date (under the name)
officeRects.append("text")
    .attr("x", d => d.x + d.width / 2)
    .attr("y", d => d.y + d.height / 2 + 10)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("class", "date-text")
    .text(d => `${d.startDate} → ${d.endDate}`);

// Append text (occupant name & dates)
officeRects.append("text")
    .attr("x", d => d.x + d.width / 2)
    .attr("y", d => d.y + d.height / 2 - 30)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("class", "id-text")
    .text(d => `${d.id}`);


// Show the popup editor
function showEditPopup(d, element) {
    currentOffice = d;
    const bbox = element.getBoundingClientRect();

    editContainer.style("display", "block")
                 .style("top", `${bbox.top + window.scrollY}px`)
                 .style("left", `${bbox.left + window.scrollX}px`);
    
    d3.select("#edit-name").node().value = d.occupant;
    d3.select("#edit-start-date").node().value = d.startDate;
    d3.select("#edit-end-date").node().value = d.endDate;
}

// Save edits
function saveEdit() {
    if (currentOffice) {
        currentOffice.occupant = d3.select("#edit-name").node().value;
        currentOffice.startDate = d3.select("#edit-start-date").node().value;
        currentOffice.endDate = d3.select("#edit-end-date").node().value;

        // Update text in SVG
        d3.selectAll(".office-text")
            .data(offices)
            .text(d => `${d.occupant}`);

        d3.selectAll(".date-text")
            .data(offices)
            .text(d => `${d.startDate} → ${d.endDate}`);
    }
    editContainer.style("display", "none");
}

// Cancel editing
function cancelEdit() {
    editContainer.style("display", "none");
}