import { NextRequest, NextResponse } from 'next/server';
import { runAllProgressIndicatorTests, formatTestResultAsHtml, testScormProgressIndicator, TEST_PACKAGES } from '@/lib/client/scorm-test-utils';

/**
 * API handler for testing SCORM progress indicator
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const testId = url.searchParams.get('testId');
  const networkCondition = url.searchParams.get('network') as 'fast' | 'slow' | 'normal' || 'normal';
  
  // Check if we're running a specific test or all tests
  if (testId) {
    // Find the test package with the specified ID
    const packageInfo = TEST_PACKAGES[parseInt(testId)];
    
    if (!packageInfo) {
      return NextResponse.json({ error: 'Invalid test ID' }, { status: 400 });
    }
    
    try {
      const result = await testScormProgressIndicator(packageInfo, undefined, networkCondition);
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json({ error: String(error) }, { status: 500 });
    }
  } else {
    // For simplicity in the API endpoint, we'll just return the test package list
    // The actual tests will be run client-side
    return NextResponse.json({ 
      packages: TEST_PACKAGES.map((pkg, index) => ({ 
        ...pkg, 
        id: index 
      }))
    });
  }
} 