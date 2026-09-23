if (typeof require !== 'undefined' && require.extensions) {
  require.extensions['.css'] = () => {};
}

console.log('[DEBUG 9.1] before OpenWorkPanelTabs');
require('../components/openwork/OpenWorkPanelTabs');
console.log('[DEBUG 9.1] after OpenWorkPanelTabs');

console.log('[DEBUG 9.2] before OpenWorkChartMediaViewer');
require('../components/openwork/OpenWorkChartMediaViewer');
console.log('[DEBUG 9.2] after OpenWorkChartMediaViewer');

console.log('[DEBUG 9.3] before OpenWorkFilesExplorer');
require('../components/openwork/OpenWorkFilesExplorer');
console.log('[DEBUG 9.3] after OpenWorkFilesExplorer');

console.log('[DEBUG 9.4] before artifactText');
require('../lib/artifacts/artifactText');
console.log('[DEBUG 9.4] after artifactText');

console.log('[DEBUG 9.5] before normalizeChart');
require('../lib/charts/normalizeChart');
console.log('[DEBUG 9.5] after normalizeChart');

console.log('[DEBUG 9.6] before WordArtifactViewer (office-word)');
require('../components/ai-data-analytic/office-word/WordArtifactViewer');
console.log('[DEBUG 9.6] after WordArtifactViewer (office-word)');

console.log('[DEBUG 9.7] before ExcelArtifactViewer (office-excel)');
require('../components/ai-data-analytic/office-excel/ExcelArtifactViewer');
console.log('[DEBUG 9.7] after ExcelArtifactViewer (office-excel)');

console.log('[DEBUG 9.8] before SlideArtifactViewer (office-slides)');
require('../components/ai-data-analytic/office-slides/SlideArtifactViewer');
console.log('[DEBUG 9.8] after SlideArtifactViewer (office-slides)');

console.log('[DEBUG 10] ALL INDIVIDUAL IMPORTS SUCCESSFUL!');
process.exit(0);
