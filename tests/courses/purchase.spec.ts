import { test, expect } from '@playwright/test';
import { loginUser, mockChapaPayment, setupTestData, cleanupTestData } from '../utils/test-helpers';
import { TEST_COURSES } from '../utils/test-data';

test.describe('Course Purchase Flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupTestData(page);
    await loginUser(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupTestData(page);
  });

  test('should successfully purchase a course', async ({ page }) => {
    // Navigate to the course page
    await page.goto('/courses/paid-test-course');
    
    // Verify course details
    await expect(page.locator('h1')).toContainText(TEST_COURSES.paid.title);
    await expect(page.locator('[data-test-id="course-price"]'))
      .toContainText(TEST_COURSES.paid.price.toString());

    // Click enroll button
    await page.click('button:has-text("Enroll")');

    // Verify redirect to Chapa
    await expect(page.url()).toContain('checkout.chapa.co');

    // Mock successful payment
    await mockChapaPayment(page);

    // Verify redirect to first chapter
    await expect(page.url()).toContain('/courses/');
    await expect(page.url()).toContain('/chapters/');
    
    // Verify enrolled status
    await expect(page.locator('[data-test-id="enrolled-badge"]')).toBeVisible();
  });

  test('should handle failed payments', async ({ page }) => {
    // Navigate to the course page
    await page.goto('/courses/paid-test-course');
    
    // Click enroll button
    await page.click('button:has-text("Enroll")');

    // Mock failed payment
    await mockChapaPayment(page, { status: 'failed' });

    // Verify redirect back to course page with error
    await expect(page.url()).toContain('/courses/paid-test-course');
    await expect(page.url()).toContain('error=payment_failed');
    
    // Verify error message
    await expect(page.locator('[data-test-id="payment-error"]')).toBeVisible();
  });

  test('should prevent duplicate purchases', async ({ page }) => {
    // First purchase
    await page.goto('/courses/paid-test-course');
    await page.click('button:has-text("Enroll")');
    await mockChapaPayment(page);

    // Try to purchase again
    await page.goto('/courses/paid-test-course');
    
    // Verify already enrolled status
    await expect(page.locator('button:has-text("Enroll")')).not.toBeVisible();
    await expect(page.locator('[data-test-id="enrolled-badge"]')).toBeVisible();
  });
}); 