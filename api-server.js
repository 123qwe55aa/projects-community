const http = require('http');
const path = require('path');

// better-sqlite3 is already installed in the app
const Database = require('better-sqlite3');

const DB_PATH = '/app/data/projects-community.db';

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/api/projects/list' || req.url === '/api/projects/list/') {
    try {
      const db = new Database(DB_PATH, { readonly: true });
      const projects = db.prepare('SELECT id, summary, background, building_style AS buildingStyle, growth_stage AS growthStage FROM projects ORDER BY created_at').all();
      const decisionCounts = db.prepare('SELECT project_id AS projectId, COUNT(*) AS count FROM decision_links GROUP BY project_id').all();
      db.close();

      const countMap = {};
      for (const row of decisionCounts) {
        countMap[row.projectId] = row.count;
      }

      const styleLabels = {
        workshop: '\uD83D\uDD28 Workshop',
        'data-center': '\uD83D\uDCCA Data Center',
        studio: '\uD83C\uDFA8 Studio',
        'community-hall': '\uD83C\uDFDB\uFE0F Community Hall',
      };

      const items = projects.map((p) => ({
        id: p.id,
        summary: p.summary || p.background || 'Untitled Project',
        background: p.background && p.background !== p.summary ? p.background : null,
        buildingStyle: styleLabels[p.buildingStyle] || p.buildingStyle,
        growthStage: p.growthStage || 'seed',
        decisionCount: countMap[p.id] || 0,
      }));

      res.end(JSON.stringify({ projects: items }));
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: e.message }));
    }
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not found' }));
  }
});

const PORT = 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Projects API server listening on port ${PORT}`);
});
