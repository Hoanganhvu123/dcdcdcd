// Step-by-step import tester
console.log('Step 0: start');
const t0 = Date.now();

function logStep(name: string) {
  console.log(`[${Date.now() - t0}ms] Step: ${name}`);
}

logStep('1. useOpenWorkStore');
require('../components/openwork/useOpenWorkStore');

logStep('2. openwork-tools');
require('../components/openwork/services/openwork-tools');

logStep('3. ExcelSkeleton');
require('../components/ai-data-analytic/skeletons/ExcelSkeleton');

logStep('4. DocxSkeleton');
require('../components/ai-data-analytic/skeletons/DocxSkeleton');

logStep('5. SlideSkeleton');
require('../components/ai-data-analytic/skeletons/SlideSkeleton');

logStep('6. ExcelArtifactViewer');
require('../components/ai-data-analytic/office-excel/ExcelArtifactViewer');

logStep('7. DocxArtifactViewer');
require('../components/ai-data-analytic/office-word/WordArtifactViewer');

logStep('8. SlideArtifactViewer');
require('../components/ai-data-analytic/office-slides/SlideArtifactViewer');

logStep('9. OpenWorkWorkbench');
require('../components/openwork/OpenWorkWorkbench');

logStep('DONE!');
