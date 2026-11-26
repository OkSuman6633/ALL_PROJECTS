import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const registerPage = readFileSync(new URL('../app/register/page.tsx', import.meta.url), 'utf8');
const onboardingPage = readFileSync(new URL('../app/onboarding/page.tsx', import.meta.url), 'utf8');
const loginPage = readFileSync(new URL('../app/login/page.tsx', import.meta.url), 'utf8');
const authContext = readFileSync(
  new URL('../components/auth/AuthContext.tsx', import.meta.url),
  'utf8'
);
const apiClient = readFileSync(new URL('../lib/api.ts', import.meta.url), 'utf8');

test('register page captures email, password, confirm password and navigates to onboarding', () => {
  assert.match(registerPage, /id="register-email"/);
  assert.match(registerPage, /id="register-password"/);
  assert.match(registerPage, /id="register-confirm-password"/);
  assert.match(registerPage, /Password and confirm password do not match/);
  assert.match(registerPage, /router\.replace\('\/onboarding'\)/);
});

test('onboarding page captures workspace name and user name and enters platform', () => {
  assert.match(onboardingPage, /id="onboarding-workspace"/);
  assert.match(onboardingPage, /id="onboarding-fullname"/);
  assert.match(onboardingPage, /completeOnboarding\(/);
  assert.match(onboardingPage, /Enter Platform/);
  assert.match(onboardingPage, /router\.replace\('\/start'\)/);
});

test('login page verifies email and password and redirects appropriately', () => {
  assert.match(loginPage, /id="login-email"/);
  assert.match(loginPage, /id="login-password"/);
  assert.match(loginPage, /await login\(/);
  assert.match(loginPage, /signedInUser\.onboarding_completed/);
  assert.match(loginPage, /router\.replace\('\/start'\)/);
});

test('api client uses stored bearer token and auth context enforces session guard', () => {
  assert.match(apiClient, /getStoredToken\(\)/);
  assert.match(apiClient, /\/v1\/auth\/me/);
  assert.doesNotMatch(apiClient, /CONFIG\.DEMO_BEARER_TOKEN/);
  assert.match(authContext, /api\.getMe\(\)/);
  assert.match(authContext, /router\.replace\('\/login'\)/);
  assert.match(authContext, /router\.replace\('\/onboarding'\)/);
});
