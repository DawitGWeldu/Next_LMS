# SCORM Service Worker Integration Test Guide

This document provides guidelines for testing the integration between the ScormStructureNav component and the service worker-based extraction and caching system.

## Overview

We've refactored the ScormStructureNav component to use the service worker for SCORM package extraction and navigation, eliminating the duplicate extraction logic. This test guide helps verify that the integration works correctly.

## Prerequisites

- A modern browser with Service Worker support (Chrome, Firefox, Edge, etc.)
- Sample SCORM packages for testing (ideally both SCORM 1.2 and SCORM 2004)
- Access to the browser's developer tools to monitor network traffic and cache storage

## Test Page

We've created a dedicated test page at `/test/scorm-integration` to validate the integration. This page allows you to:

1. Check service worker availability and readiness
2. Load different SCORM packages
3. Toggle between showing ScormPreview and ScormStructureNav components
4. Monitor progress and error reporting
5. Test navigation between components

## Test Scenarios

### 1. Basic Functionality

- **Objective**: Verify that both components can load and display SCORM content using the service worker
- **Steps**:
  1. Navigate to the test page
  2. Confirm the service worker is active
  3. Enter a valid SCORM package URL
  4. Click "Load"
  5. Verify both components display the content correctly

### 2. Single Extraction

- **Objective**: Verify that the package is only extracted once when both components are on the same page
- **Steps**:
  1. Clear the browser cache
  2. Open the Network tab in developer tools
  3. Load a SCORM package on the test page
  4. Verify only one download request is made for the package
  5. Check the service worker cache storage to confirm the package is stored

### 3. Navigation Consistency

- **Objective**: Verify that navigation works correctly between components
- **Steps**:
  1. Load a SCORM package with a complex structure
  2. Click on different items in the ScormStructureNav
  3. Verify the content updates correctly in the preview area
  4. Check the URL format to confirm it's using service worker URLs

### 4. Error Handling

- **Objective**: Verify that error scenarios are handled properly
- **Steps**:
  1. Test with an invalid or non-existent SCORM package
  2. Verify appropriate error messages are displayed
  3. Test with service workers disabled
  4. Verify the component degrades gracefully with informative errors

### 5. Caching and Reuse

- **Objective**: Verify that cached packages are reused
- **Steps**:
  1. Load a SCORM package
  2. Refresh the page
  3. Load the same package again
  4. Verify extraction is skipped and the cached version is used

## Verification Checklist

Use the following checklist to validate the integration:

- [ ] Service worker successfully registers and controls the page
- [ ] ScormStructureNav component displays the navigation structure correctly
- [ ] ScormPreview component renders the content correctly
- [ ] Navigation between items works correctly
- [ ] Only one extraction occurs for the same package
- [ ] Progress reporting works for both components
- [ ] Error handling provides informative messages
- [ ] Components work correctly with service worker caching
- [ ] Components handle service worker absence gracefully

## Debugging Tips

### Service Worker Inspection

To inspect the service worker cache:

1. Open Chrome DevTools
2. Go to the Application tab
3. Expand the "Cache Storage" section
4. Click on "scorm-cache-v1"

### Network Monitoring

To verify single extraction:

1. Open the Network tab in DevTools
2. Filter by "Fetch/XHR"
3. Look for requests to the SCORM package URL

### Console Logging

Both components include extensive console logging:

- Messages prefixed with `[Preview DEBUG]` come from ScormPreview
- Messages prefixed with `[Registry DEBUG]` come from the service-worker-registry

## Common Issues and Solutions

### Service Worker Not Controlling Page

If you see "Service Worker registered but not controlling this page":
- Refresh the page to allow the service worker to take control
- Check if service workers are disabled in your browser

### CORS Issues

If you see CORS-related errors:
- Ensure the SCORM package is served from the same origin
- Or ensure proper CORS headers are set on the server

### Extraction Errors

If extraction fails:
- Check if the URL is correct
- Verify the file is a valid ZIP
- Check if the package contains a valid imsmanifest.xml file

## Conclusion

The integration between ScormStructureNav and the service worker system ensures efficient SCORM package handling, eliminating duplicate extraction and providing a consistent user experience. This test guide helps verify that all aspects of the integration work as expected. 