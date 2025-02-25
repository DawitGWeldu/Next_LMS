import { test, expect } from '@playwright/test';

const TEST_CODE = '012345';

test.describe('Registration Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clean up any existing test data
    await page.goto('http://localhost:3000');
    const cleanupResponse = await page.request.post('/api/test/cleanup');
    expect(cleanupResponse.ok()).toBeTruthy();
    // Wait for cleanup to complete
    await page.waitForTimeout(1000);
  });

  test('should successfully register a new user', async ({ page }) => {
    const testUser = {
      name: 'Test User',
      phoneNumber: '+251912345678',  // This will be parsed to '912345678'
      password: 'password123'
    };

    // Navigate to registration page
    await page.goto('/auth/register');
    await page.waitForLoadState('networkidle');

    // Mock SMS service before registration
    const mockSmsResponse = await page.request.post('/api/test/mock-sms', {
      data: { phoneNumber: testUser.phoneNumber }
    });
    expect(mockSmsResponse.ok()).toBeTruthy();
    const { code } = await mockSmsResponse.json();
    expect(code).toBe(TEST_CODE);

    // Fill in registration form
    await page.fill('input[name="name"]', testUser.name);
    await page.fill('input[name="phoneNumber"]', testUser.phoneNumber);
    await page.fill('input[name="password"]', testUser.password);

    // Submit form and wait for navigation
    const submitButton = page.locator('button[type="submit"]');
    await Promise.all([
      page.waitForURL('/auth/new-verification'),
      page.waitForLoadState('networkidle'),
      submitButton.click()
    ]);

    // Verify we're on the verification page
    expect(page.url()).toContain('/auth/new-verification');
    
    // Wait for and verify OTP inputs are present
    const firstInput = page.locator('input[name="otp-0"]');
    await firstInput.waitFor({ state: 'visible' });
    const codeInputs = await page.locator('input[name^="otp-"]').all();
    expect(codeInputs).toHaveLength(6);

    // Enter verification code
    for (let i = 0; i < TEST_CODE.length; i++) {
      const input = page.locator(`input[name="otp-${i}"]`);
      await input.fill(TEST_CODE[i]);
      // Verify the input value
      const value = await input.inputValue();
      expect(value).toBe(TEST_CODE[i]);
    }

    // Submit verification form and wait for navigation
    const verifyButton = page.locator('button[type="submit"]');
    await Promise.all([
      page.waitForURL('/auth/login'),
      page.waitForLoadState('networkidle'),
      verifyButton.click()
    ]);

    // Verify we're redirected to login
    expect(page.url()).toContain('/auth/login');

    // Try to log in with new credentials
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');
    await page.fill('input[name="phoneNumber"]', testUser.phoneNumber);
    await page.fill('input[name="password"]', testUser.password);

    // Submit login form and wait for navigation
    const loginButton = page.locator('button[type="submit"]');
    await Promise.all([
      page.waitForURL('/search'),
      page.waitForLoadState('networkidle'),
      loginButton.click()
    ]);

    // Final verification - we should be on the search page and logged in
    expect(page.url()).toContain('/search');
  });
}); 