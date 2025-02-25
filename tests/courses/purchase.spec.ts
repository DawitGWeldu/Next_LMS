import { test, expect } from '@playwright/test';
import { hash } from 'bcryptjs';
import { db } from '@/lib/db';
import parsePhoneNumber from 'libphonenumber-js';

const COURSE_ID = '945a7e40-4ed5-4959-b063-1726ae511d3c';
const CHAPTER_ID = '71814c68-a972-460e-a3cd-9e8b456dc9ff';

const TEST_USER = {
  name: 'Test User',
  phoneNumber: '+251912345678',  // Will be parsed to '912345678'
  password: '123456'
};

test.describe('Course Purchase Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clean up any existing test data
    await page.goto('http://localhost:3000');
    const cleanupResponse = await page.request.post('/api/test/cleanup');
    expect(cleanupResponse.ok()).toBeTruthy();
    await page.waitForTimeout(1000);

    // Create test user with verified phone number
    const hashedPassword = await hash(TEST_USER.password, 12);
    const nationalNumber = parsePhoneNumber(TEST_USER.phoneNumber)!.nationalNumber;

    await db.user.create({
      data: {
        name: TEST_USER.name,
        phoneNumber: nationalNumber,
        password: hashedPassword,
        phoneNumberVerified: new Date(), // Mark as verified
      }
    });

    // Login with test user
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');
    await page.fill('input[name="phoneNumber"]', TEST_USER.phoneNumber);
    await page.fill('input[name="password"]', TEST_USER.password);
    
    const loginButton = page.locator('button[type="submit"]');
    await Promise.all([
      page.waitForURL('/search'),
      page.waitForLoadState('networkidle'),
      loginButton.click()
    ]);
  });

  test('should successfully purchase a course', async ({ page }) => {
    // Navigate directly to the course page
    await page.goto(`/courses/${COURSE_ID}/chapters/${CHAPTER_ID}`);
    await page.waitForLoadState('networkidle');
    
    // Get course details for verification
    const courseTitle = await page.locator('h1').textContent();
    const enrollButton = page.locator('button:has-text("Enroll")');
    
    // Verify course has a price
    const enrollButtonText = await enrollButton.textContent();
    expect(enrollButtonText).toContain('ETB');

    // Click enroll button and wait for Chapa redirect
    await Promise.all([
      page.waitForURL('**/checkout.chapa.co/**'),
      enrollButton.click()
    ]);

    // Wait for and fill in Chapa test checkout form
    const mobileInput = await page.waitForSelector('input[name="mobile"]', { state: 'visible' });
    await mobileInput.fill('0912345678');
    
    // Find and click the submit button, this will trigger a series of redirects
    const submitButton = await page.waitForSelector('button[type="submit"]', { state: 'visible' });
    
    // Click submit and wait for the final redirect
    await submitButton.click();
    
    // Wait for the final redirect back to our course page
    await page.waitForURL(`**/courses/${COURSE_ID}/chapters/${CHAPTER_ID}`);
    
    // Wait for either the "Mark as complete" or "Not completed" button to appear
    const completionButton = page.locator('button:has-text("Mark as complete"), button:has-text("Not completed")');
    await expect(completionButton).toBeVisible();

    // Verify purchase record exists
    const response = await page.request.get(`/api/courses/${COURSE_ID}/purchase`);
    expect(response.ok()).toBeTruthy();
    const purchase = await response.json();
    expect(purchase.courseId).toBe(COURSE_ID);
  });
}); 