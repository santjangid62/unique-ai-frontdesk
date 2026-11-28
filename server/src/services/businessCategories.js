/**
 * Business categories. Each category decides what the AI is told to collect
 * and how the offering section is described, so a kirana shop is asked for
 * products and an IT company for services instead of coaching courses.
 */
export const BUSINESS_INDUSTRIES = [
  'coaching',
  'individual_tutor',
  'kirana',
  'it_company',
  'healthcare',
  'hotels',
  'real_estate',
  'salon',
  'other',
];

const CATEGORIES = {
  coaching: {
    label: 'Coaching Center',
    offering: 'Course',
    offerings: 'Courses',
    fields: 'courses, fees, batch timings and demo class bookings',
    agent: 'Help with course information, fees, batch timings and demo class bookings.',
    demo: true,
  },
  individual_tutor: {
    label: 'Individual Tutor',
    offering: 'Subject',
    offerings: 'Subjects',
    fields: 'subjects, fees, class timings and trial lessons',
    agent: 'Help with subjects taught, fees, class timings and trial lesson bookings.',
    demo: true,
  },
  kirana: {
    label: 'Kirana Shop',
    offering: 'Product',
    offerings: 'Products',
    fields: 'products, prices, pack sizes and availability',
    agent: 'Help with product availability, prices, pack sizes, delivery and shop timings.',
  },
  it_company: {
    label: 'IT Company',
    offering: 'Service',
    offerings: 'Services',
    fields: 'services, pricing, delivery timelines and project scope',
    agent: 'Help with services offered, pricing, delivery timelines and project scope.',
  },
  healthcare: {
    label: 'Clinic / Healthcare',
    offering: 'Service',
    offerings: 'Services',
    fields: 'services, consultation fees, timings and appointments',
    agent: 'Help with services, consultation fees, clinic timings and appointment bookings.',
  },
  hotels: {
    label: 'Hotel / Guest House',
    offering: 'Room or package',
    offerings: 'Rooms & packages',
    fields: 'rooms, tariffs, check-in timings and packages',
    agent: 'Help with room types, tariffs, availability, check-in timings and packages.',
  },
  real_estate: {
    label: 'Real Estate',
    offering: 'Listing',
    offerings: 'Listings',
    fields: 'properties, prices, sizes and site-visit slots',
    agent: 'Help with properties, prices, sizes, locations and site-visit bookings.',
  },
  salon: {
    label: 'Salon / Spa',
    offering: 'Service',
    offerings: 'Services',
    fields: 'services, prices, durations and appointment slots',
    agent: 'Help with services, prices, durations and appointment bookings.',
  },
  other: {
    label: 'Other',
    offering: 'Offering',
    offerings: 'Offerings',
    fields: 'offerings, prices, timings and availability',
    agent: 'Help with the offerings, prices, timings and availability of the business.',
  },
};

export function businessCategory(industry) {
  return CATEGORIES[industry] || CATEGORIES.other;
}

export default businessCategory;
