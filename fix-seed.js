const fs = require('fs');
let content = fs.readFileSync('data/seed/org-coordinates.js', 'utf8');
content = content.replace(/quality: "place"/g, 'quality: "estimated"');
content = content.replace(/quality: "street"/g, 'quality: "estimated"');
content = content.replace(/quality: "site"/g, 'quality: "verified"');
content = content.replace(/quality: "town"/g, 'quality: "town-centre"');
fs.writeFileSync('data/seed/org-coordinates.js', content);
console.log("Fixed!");