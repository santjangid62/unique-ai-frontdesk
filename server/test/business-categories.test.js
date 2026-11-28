import assert from 'node:assert/strict';
import test from 'node:test';
import { BUSINESS_INDUSTRIES, businessCategory } from '../src/services/businessCategories.js';

test('every new-business category has catalogue labels and AI guidance', () => {
  for (const industry of BUSINESS_INDUSTRIES) {
    const category = businessCategory(industry);
    assert.ok(category.label, `${industry} needs a label`);
    assert.ok(category.offering, `${industry} needs a singular offering label`);
    assert.ok(category.offerings, `${industry} needs a plural offering label`);
    assert.ok(category.fields, `${industry} needs fields the AI should collect`);
    assert.ok(category.agent, `${industry} needs agent instructions`);
  }
});

test('categories offer the right wording instead of fixed courses', () => {
  assert.equal(businessCategory('coaching').offerings, 'Courses');
  assert.equal(businessCategory('individual_tutor').offerings, 'Subjects');
  assert.equal(businessCategory('kirana').offerings, 'Products');
  assert.equal(businessCategory('it_company').offerings, 'Services');
  assert.equal(businessCategory('hotels').offerings, 'Rooms & packages');
  assert.equal(businessCategory('real_estate').offerings, 'Listings');
  assert.equal(businessCategory('salon').offerings, 'Services');
  assert.equal(businessCategory('other').offerings, 'Offerings');
});

test('only coaching and individual tutors offer a trial or demo', () => {
  const demoCategories = BUSINESS_INDUSTRIES.filter((industry) => businessCategory(industry).demo === true);
  assert.deepEqual(demoCategories.sort(), ['coaching', 'individual_tutor']);
});

test('unknown or legacy values fall back to the generic category', () => {
  assert.equal(businessCategory('unknown-shop').label, 'Other');
  assert.equal(businessCategory(undefined).label, 'Other');
});
