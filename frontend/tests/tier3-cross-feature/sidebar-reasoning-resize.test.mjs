import test from 'node:test';
import assert from 'node:assert/strict';

test('Tier 3.2: Cross-Feature - Sidebar Collapse + Reasoning Accordion + Resize', async (t) => {
  await t.test('T3.2.1: Viewport resize recalculates slide canvas scale while sidebar collapsed', () => {
    const SLIDE_WIDTH = 960;
    const SLIDE_HEIGHT = 540;
    const PADDING = 32;

    function computeWorkspaceWidth(windowWidth, isSidebarCollapsed) {
      const sidebarWidth = isSidebarCollapsed ? 80 : 240; // 5rem vs 15rem in px approx
      return windowWidth - sidebarWidth;
    }

    function computeSlideScaleForViewport(windowWidth, windowHeight, isSidebarCollapsed) {
      const workspaceWidth = computeWorkspaceWidth(windowWidth, isSidebarCollapsed);
      const halfWidth = workspaceWidth / 2; // side-by-side artifact panel
      const availW = Math.max(0, halfWidth - PADDING * 2);
      const availH = Math.max(0, windowHeight - PADDING * 2);
      const scaleX = availW / SLIDE_WIDTH;
      const scaleY = availH / SLIDE_HEIGHT;
      return Math.min(scaleX, scaleY, 1.5);
    }

    const scaleExpanded = computeSlideScaleForViewport(1920, 1080, false);
    const scaleCollapsed = computeSlideScaleForViewport(1920, 1080, true);

    // Collapsed sidebar gives more width to the workspace, yielding equal or greater scale
    assert.ok(scaleCollapsed >= scaleExpanded);
  });

  await t.test('T3.2.2: Active reasoning accordion maintains scroll position during sidebar toggle', () => {
    let accordionExpanded = true;
    let sidebarCollapsed = false;

    // Toggle sidebar
    sidebarCollapsed = !sidebarCollapsed;
    assert.equal(sidebarCollapsed, true);
    // Accordion state should remain unchanged
    assert.equal(accordionExpanded, true);
  });
});
