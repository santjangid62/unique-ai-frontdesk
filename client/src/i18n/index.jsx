import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'uaf_language';

export const LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'hi', label: 'हिन्दी', short: 'हिं' },
];

/**
 * English source text -> Hindi. Components call t('Overview') and the English
 * string itself is the key, so a missing translation simply renders English
 * instead of breaking the UI.
 */
const HI = {
  // Navigation and shell
  Platform: 'प्लेटफ़ॉर्म',
  Account: 'खाता',
  Workspace: 'वर्कस्पेस',
  Growth: 'विकास',
  Manage: 'प्रबंधन',
  'My Work': 'मेरा काम',
  Overview: 'अवलोकन',
  Businesses: 'व्यवसाय',
  Users: 'उपयोगकर्ता',
  'Subscription Plans': 'सब्सक्रिप्शन प्लान',
  'Audit Logs': 'ऑडिट लॉग',
  Notifications: 'सूचनाएं',
  Profile: 'प्रोफ़ाइल',
  'AI Receptionist': 'AI रिसेप्शनिस्ट',
  'Knowledge Base': 'नॉलेज बेस',
  'Website Chat': 'वेबसाइट चैट',
  Conversations: 'बातचीत',
  Leads: 'लीड्स',
  'My Leads': 'मेरे लीड्स',
  Customers: 'ग्राहक',
  Appointments: 'अपॉइंटमेंट',
  'Voice Calls': 'वॉइस कॉल',
  Reports: 'रिपोर्ट्स',
  Staff: 'स्टाफ़',
  Subscription: 'सब्सक्रिप्शन',
  'Business Settings': 'व्यवसाय सेटिंग्स',
  'Training guide': 'ट्रेनिंग गाइड',
  'Platform Console': 'प्लेटफ़ॉर्म कंसोल',
  'Business workspace': 'व्यवसाय वर्कस्पेस',
  'Unique AI Frontdesk': 'यूनिक AI फ्रंटडेस्क',
  'A Unit of Unique Computers, The Best One.': 'यूनिक कंप्यूटर्स, द बेस्ट वन की एक इकाई।',
  'All rights reserved.': 'सर्वाधिकार सुरक्षित।',
  '24/7 AI receptionist · never miss a customer': '24/7 AI रिसेप्शनिस्ट · कोई ग्राहक न छूटे',
  'Open navigation': 'नेविगेशन खोलें',
  'Close navigation': 'नेविगेशन बंद करें',
  'Sign out': 'साइन आउट',
  Language: 'भाषा',
  'Change language': 'भाषा बदलें',

  // Common
  Loading: 'लोड हो रहा है',
  'Loading…': 'लोड हो रहा है…',
  'Saving…': 'सेव हो रहा है…',
  'Creating…': 'बना रहे हैं…',
  'Updating…': 'अपडेट हो रहा है…',
  'Signing in…': 'साइन इन हो रहा है…',
  'Generating…': 'बना रहे हैं…',
  Save: 'सेव',
  'Save changes': 'बदलाव सेव करें',
  'Save profile': 'प्रोफ़ाइल सेव करें',
  Cancel: 'रद्द करें',
  Add: 'जोड़ें',
  Remove: 'हटाएं',
  Search: 'खोजें',
  Status: 'स्थिति',
  Active: 'सक्रिय',
  Inactive: 'निष्क्रिय',
  Disabled: 'बंद',
  Never: 'कभी नहीं',
  Open: 'खोलें',
  'Mark read': 'पढ़ा हुआ करें',
  'Mark all read': 'सभी पढ़े हुए करें',
  Download: 'डाउनलोड',
  Check: 'जांचें',
  'No configuration required': 'कोई कॉन्फ़िगरेशन ज़रूरी नहीं',
  Close: 'बंद करें',
  Email: 'ईमेल',
  Phone: 'फ़ोन',
  Name: 'नाम',
  Password: 'पासवर्ड',
  Date: 'तारीख',
  Time: 'समय',
  Type: 'प्रकार',
  Notes: 'नोट्स',
  Note: 'नोट',
  Source: 'स्रोत',
  Course: 'कोर्स',
  Address: 'पता',
  City: 'शहर',
  State: 'राज्य',
  Website: 'वेबसाइट',
  Industry: 'उद्योग',
  Plan: 'प्लान',
  Code: 'कोड',
  Title: 'शीर्षक',
  Description: 'विवरण',
  Category: 'श्रेणी',
  Tags: 'टैग',
  'Full name': 'पूरा नाम',
  'Business name': 'व्यवसाय का नाम',
  'Your name': 'आपका नाम',
  'Work email': 'कार्य ईमेल',
  'Current password': 'मौजूदा पासवर्ड',
  'New password': 'नया पासवर्ड',
  Designation: 'पदनाम',
  Role: 'भूमिका',
  'Last login': 'अंतिम लॉगिन',
  Member: 'सदस्य',
  Access: 'एक्सेस',
  'Assigned leads': 'सौंपे गए लीड्स',
  'Business profile': 'व्यवसाय प्रोफ़ाइल',
  'About the business': 'व्यवसाय के बारे में',
  'Google Maps link': 'गूगल मैप्स लिंक',
  'Opening time': 'खुलने का समय',
  'Closing time': 'बंद होने का समय',
  'Working days': 'कार्य दिवस',
  'Supported languages': 'समर्थित भाषाएं',
  'Free trial / demo': 'मुफ़्त ट्रायल / डेमो',
  'Next steps after enquiry': 'पूछताछ के बाद के चरण',
  'Additional support': 'अतिरिक्त सहायता',
  Courses: 'कोर्स',
  'Course name': 'कोर्स का नाम',
  'Fee (INR)': 'फीस (INR)',
  Duration: 'अवधि',
  Mode: 'मोड',
  'Batch timings': 'बैच समय',
  Syllabus: 'सिलेबस',
  'Add course': 'कोर्स जोड़ें',
  'No courses yet. Add your courses so the AI can answer fee and batch questions.':
    'अभी कोई कोर्स नहीं है। अपने कोर्स जोड़ें ताकि AI फीस और बैच के सवालों के जवाब दे सके।',
  'Channel integrations': 'चैनल इंटीग्रेशन',
  'Credentials are stored per business and never returned in full. Webhooks are signature-verified.':
    'क्रेडेंशियल्स हर व्यवसाय के लिए अलग स्टोर होते हैं और पूरे कभी नहीं दिखाए जाते। वेबहुक्स सिग्नेचर से सत्यापित होते हैं।',
  'Platform AI key': 'प्लेटफ़ॉर्म AI कुंजी',
  configured: 'कॉन्फ़िगर है',
  'not configured (grounded fallback active)': 'कॉन्फ़िगर नहीं है (ग्राउंडेड फ़ॉलबैक सक्रिय)',
  'No team members': 'कोई टीम सदस्य नहीं',
  'Add team member': 'टीम सदस्य जोड़ें',
  'Create member': 'सदस्य बनाएं',
  'Staff Management': 'स्टाफ़ प्रबंधन',
  'Access level': 'एक्सेस स्तर',
  'Staff (assigned work only)': 'स्टाफ़ (सिर्फ़ सौंपा गया काम)',
  'Business admin (full access)': 'व्यवसाय एडमिन (पूरा एक्सेस)',
  'Deactivate': 'निष्क्रिय करें',
  'Activate': 'सक्रिय करें',
  'They can sign in immediately with the password you set.':
    'आपके सेट किए पासवर्ड से वे तुरंत साइन इन कर सकते हैं।',
  'Staff see only leads assigned to them, their conversations and their appointments.':
    'स्टाफ़ को सिर्फ़ उन्हें सौंपे गए लीड्स, उनकी बातचीत और उनके अपॉइंटमेंट दिखते हैं।',
  'Minimum 8 characters.': 'कम से कम 8 अक्षर।',
  'Minimum 8 characters with a letter and a number.': 'कम से कम 8 अक्षर, जिसमें एक अक्षर और एक अंक हो।',
  'At least 8 characters with a letter and a number.': 'कम से कम 8 अक्षर, जिसमें एक अक्षर और एक अंक हो।',
  'Comma separated': 'कॉमा से अलग करें',
  'No invoices yet.': 'अभी कोई इनवॉइस नहीं।',
  Invoices: 'इनवॉइस',
  Invoice: 'इनवॉइस',
  Amount: 'रकम',
  Period: 'अवधि',
  Issued: 'जारी',
  'Current plan': 'मौजूदा प्लान',
  'Active plan': 'सक्रिय प्लान',
  Current: 'वर्तमान',
  'Subscription & Usage': 'सब्सक्रिप्शन और उपयोग',
  'Track plan limits across AI, voice and WhatsApp, and manage renewals.':
    'AI, वॉइस और WhatsApp पर प्लान की सीमाएं देखें और रिन्यूअल संभालें।',
  'AI messages': 'AI संदेश',
  'Voice minutes': 'वॉइस मिनट',
  'WhatsApp messages': 'WhatsApp संदेश',
  'Knowledge entries': 'नॉलेज एंट्रीज़',
  'AI messages / month': 'AI संदेश / माह',
  'Voice minutes / month': 'वॉइस मिनट / माह',
  'WhatsApp messages / month': 'WhatsApp संदेश / माह',
  'AI messages (month)': 'AI संदेश (माह)',
  'Voice minutes (all)': 'वॉइस मिनट (कुल)',
  'Monthly recurring revenue': 'मासिक आवर्ती राजस्व',
  'Paid invoices': 'भुगतान किए इनवॉइस',
  'Active users': 'सक्रिय उपयोगकर्ता',
  'Staff seats': 'स्टाफ़ सीट्स',
  'AI agents': 'AI एजेंट',
  'Total leads': 'कुल लीड्स',
  'Upcoming appointments': 'आगामी अपॉइंटमेंट',
  'Appointments today': 'आज के अपॉइंटमेंट',
  'AI resolution rate': 'AI समाधान दर',
  'AI resolution': 'AI समाधान',
  'Loading your dashboard…': 'आपका डैशबोर्ड लोड हो रहा है…',
  'Loading your day…': 'आपका दिन लोड हो रहा है…',
  'Loading appointments…': 'अपॉइंटमेंट लोड हो रहे हैं…',
  'Loading business profile…': 'व्यवसाय प्रोफ़ाइल लोड हो रही है…',
  'Loading plans…': 'प्लान लोड हो रहे हैं…',
  'Loading platform metrics…': 'प्लेटफ़ॉर्म मेट्रिक्स लोड हो रहे हैं…',
  'Loading widget settings…': 'विजेट सेटिंग्स लोड हो रही हैं…',
  'Loading your subscription…': 'आपका सब्सक्रिप्शन लोड हो रहा है…',
  'Loading your workspace…': 'आपका वर्कस्पेस लोड हो रहा है…',
  'Building your report…': 'आपकी रिपोर्ट बन रही है…',
  'Extracting text and creating entries…': 'टेक्स्ट निकालकर एंट्रीज़ बन रही हैं…',
  'No leads found': 'कोई लीड नहीं मिली',
  'No leads yet': 'अभी कोई लीड नहीं',
  'No leads assigned': 'कोई लीड सौंपी नहीं गई',
  'No customers yet': 'अभी कोई ग्राहक नहीं',
  'No conversations yet': 'अभी कोई बातचीत नहीं',
  'No conversations': 'कोई बातचीत नहीं',
  'No appointments in this view': 'इस व्यू में कोई अपॉइंटमेंट नहीं',
  'No upcoming appointments': 'कोई आगामी अपॉइंटमेंट नहीं',
  'No calls recorded': 'कोई कॉल रिकॉर्ड नहीं',
  'No knowledge entries': 'कोई नॉलेज एंट्री नहीं',
  'No documents uploaded': 'कोई दस्तावेज़ अपलोड नहीं',
  'No users found': 'कोई उपयोगकर्ता नहीं मिला',
  'No businesses yet': 'अभी कोई व्यवसाय नहीं',
  'No audit entries': 'कोई ऑडिट एंट्री नहीं',
  'No AI agent yet': 'अभी कोई AI एजेंट नहीं',
  'Nothing scheduled': 'कुछ भी शेड्यूल नहीं',
  'You are all caught up': 'सब पढ़ लिया — कुछ बाकी नहीं',
  'New activity will appear here.': 'नई गतिविधि यहां दिखेगी।',
  'Nothing here yet': 'अभी यहां कुछ नहीं',
  'Select a conversation': 'बातचीत चुनें',
  'Conversation unavailable': 'बातचीत उपलब्ध नहीं',
  'Pick a chat on the left to read the transcript and reply.':
    'ट्रांसक्रिप्ट पढ़ने और जवाब देने के लिए बाईं ओर से चैट चुनें।',
  'Reply as staff — this pauses the AI for this chat': 'स्टाफ़ के रूप में जवाब दें — इस चैट के लिए AI रुक जाएगा',
  'Send message': 'संदेश भेजें',
  'Ask a customer question': 'ग्राहक जैसा सवाल पूछें',
  'Ask about courses, fees or a demo class…': 'कोर्स, फीस या डेमो क्लास के बारे में पूछें…',
  'Search name, phone or message': 'नाम, फ़ोन या संदेश खोजें',
  'Search name, phone, course': 'नाम, फ़ोन, कोर्स खोजें',
  'Search name or email': 'नाम या ईमेल खोजें',
  'Search customers': 'ग्राहक खोजें',
  'Search knowledge': 'नॉलेज खोजें',
  'Search business or slug': 'व्यवसाय या स्लग खोजें',
  'Filter by action (for example login)': 'एक्शन से फ़िल्टर करें (जैसे login)',
  'No contact': 'कोई संपर्क नहीं',
  'No phone': 'फ़ोन नहीं',
  'Loading team…': 'टीम लोड हो रही है…',
  'Try a different filter, or add your first lead.': 'दूसरा फ़िल्टर आज़माएं या पहली लीड जोड़ें।',
  'Your admin can assign enquiries to you.': 'आपका एडमिन आपको पूछताछ सौंप सकता है।',

  // Page headers
  Configuration: 'कॉन्फ़िगरेशन',
  Activity: 'गतिविधि',
  Team: 'टीम',
  Billing: 'बिलिंग',
  Calendar: 'कैलेंडर',
  Documentation: 'दस्तावेज़',
  Inbox: 'इनबॉक्स',
  Insights: 'इनसाइट्स',
  Monetization: 'मॉनेटाइज़ेशन',
  Directory: 'डायरेक्टरी',
  Security: 'सुरक्षा',
  'AI configuration': 'AI कॉन्फ़िगरेशन',
  'Grounded AI': 'ग्राउंडेड AI',
  'Voice channel': 'वॉइस चैनल',
  'Website channel': 'वेबसाइट चैनल',
  'These details are given to the AI on every reply, so keep them accurate.':
    'ये जानकारी AI को हर जवाब में दी जाती है, इसलिए सही रखें।',
  'Step-by-step guide to training the AI receptionist for your business — read-only.':
    'अपने व्यवसाय के लिए AI रिसेप्शनिस्ट ट्रेन करने की स्टेप-बाय-स्टेप गाइड — केवल पढ़ने के लिए।',
  'AI Training Guide': 'AI ट्रेनिंग गाइड',
  'New leads, handoffs, appointments and billing alerts.':
    'नए लीड्स, हैंडऑफ़, अपॉइंटमेंट और बिलिंग अलर्ट।',
  'Your personal details and sign-in security.': 'आपकी निजी जानकारी और साइन-इन सुरक्षा।',
  'My Profile': 'मेरी प्रोफ़ाइल',
  'Every tenant on the platform, with plan, usage and account status.':
    'प्लेटफ़ॉर्म के सभी व्यवसाय, प्लान, उपयोग और खाता स्थिति के साथ।',
  'All platform, business admin and staff accounts in one list.':
    'प्लेटफ़ॉर्म, व्यवसाय एडमिन और स्टाफ़ के सभी खाते एक सूची में।',
  'Plan pricing and limits drive tenant feature gates and usage meters.':
    'प्लान की कीमत और सीमाएं व्यवसाय की सुविधाएं और उपयोग मीटर तय करती हैं।',
  'Authentication, tenant changes and cross-tenant access attempts are all recorded.':
    'लॉगिन, व्यवसाय में बदलाव और दूसरे व्यवसाय तक पहुंच के प्रयास सब रिकॉर्ड होते हैं।',
  'Channel performance, AI resolution and conversion for your business.':
    'आपके व्यवसाय के चैनल प्रदर्शन, AI समाधान और कन्वर्ज़न।',
  'Every enquiry from chat, WhatsApp, calls and walk-ins — deduplicated by phone.':
    'चैट, WhatsApp, कॉल और वॉक-इन से हर पूछताछ — फ़ोन से डुप्लीकेट हटाकर।',
  'Demo classes, counselling and admission slots. Double bookings are blocked automatically.':
    'डेमो क्लास, काउंसलिंग और एडमिशन स्लॉट। डबल बुकिंग अपने आप रुकती है।',
  'Everyone your AI has spoken to, with their full conversation and appointment history.':
    'आपके AI से बात करने वाला हर व्यक्ति, पूरी बातचीत और अपॉइंटमेंट इतिहास के साथ।',
  'Inbound calls answered by the AI receptionist, with transcripts and summaries.':
    'AI रिसेप्शनिस्ट द्वारा उठाई गई इनबाउंड कॉल, ट्रांसक्रिप्ट और सारांश के साथ।',
  'Match the widget to your brand, then paste one line of code on your website.':
    'विजेट को अपनी ब्रांडिंग से मिलाएं, फिर वेबसाइट पर एक लाइन का कोड लगाएं।',
  'Add fees, courses, timings and FAQs so the AI can answer accurately.':
    'फीस, कोर्स, समय और FAQs जोड़ें ताकि AI सही जवाब दे।',
  'Book a demo class manually, or let the AI receptionist book it during a conversation.':
    'डेमो क्लास मैन्युअली बुक करें, या AI रिसेप्शनिस्ट से बातचीत के दौरान बुक कराएं।',
  'Chats from your widget, WhatsApp and calls appear here.':
    'आपके विजेट, WhatsApp और कॉल की बातचीत यहां दिखती है।',
  'Create the first tenant to get started.': 'शुरुआत करने के लिए पहला व्यवसाय बनाएं।',
  'Create your first receptionist to start answering enquiries.':
    'पहला रिसेप्शनिस्ट बनाएं और पूछताछ के जवाब देना शुरू करें।',
  'Creates the tenant, its profile and an optional business admin login.':
    'व्यवसाय, उसकी प्रोफ़ाइल और वैकल्पिक एडमिन लॉगिन बनाता है।',
  'Customers are created automatically when a lead shares contact details.':
    'लीड संपर्क जानकारी देते ही ग्राहक अपने आप बन जाते हैं।',
  'Demo class bookings will appear here automatically.':
    'डेमो क्लास बुकिंग यहां अपने आप दिखेंगी।',
  'Duplicate phone numbers are merged into the existing lead automatically.':
    'डुप्लीकेट फ़ोन नंबर अपने आप मौजूदा लीड में मिल जाते हैं।',
  'Instructions are combined with your verified knowledge base on every reply.':
    'हर जवाब में निर्देश आपके सत्यापित नॉलेज बेस के साथ जुड़ते हैं।',
  'Share your widget or connect WhatsApp to start receiving enquiries.':
    'अपना विजेट शेयर करें या WhatsApp जोड़ें और पूछताछ पाना शुरू करें।',
  'Test answers against your knowledge base. Nothing is saved and no lead is created.':
    'अपने नॉलेज बेस पर जवाब टेस्ट करें। कुछ सेव नहीं होता और कोई लीड नहीं बनती।',
  'The AI will capture leads from chat, WhatsApp and calls.':
    'AI चैट, WhatsApp और कॉल से लीड्स कैप्चर करेगा।',
  'The slot is validated against working hours, holidays and existing bookings.':
    'स्लॉट कार्य समय, छुट्टियों और मौजूदा बुकिंग से जांचा जाता है।',
  'Upload a PDF or text file — it is split into knowledge entries automatically.':
    'PDF या टेक्स्ट फ़ाइल अपलोड करें — वह अपने आप नॉलेज एंट्रीज़ में बंट जाती है।',
  'Used by the AI to introduce your institute.': 'AI इसका इस्तेमाल आपके संस्थान को बताने के लिए करता है।',
  'Write facts exactly as the AI may state them to a customer.':
    'तथ्य वैसे लिखें जैसे AI ग्राहक को बता सकता है।',
  'Guardrails: never invent fees, availability or policies.':
    'नियम: फीस, उपलब्धता या पॉलिसी कभी न बनाएं।',
  'Lowercase identifier': 'छोटे अक्षरों में पहचान',
  'Comma separated, for example: python, fees, demo': 'कॉमा से अलग करें, जैसे: python, fees, demo',

  // Agent / knowledge / widget
  'AI agents': 'AI एजेंट',
  'Agent name': 'एजेंट का नाम',
  Greeting: 'अभिवादन',
  Personality: 'व्यक्तित्व',
  Tone: 'टोन',
  'Voice profile': 'वॉइस प्रोफ़ाइल',
  'Business instructions': 'व्यवसाय निर्देश',
  'Enabled channels': 'सक्रिय चैनल',
  'Transfer number (human handoff)': 'ट्रांसफ़र नंबर (मानव हैंडऑफ़)',
  'Verified content': 'सत्यापित सामग्री',
  'Welcome message': 'स्वागत संदेश',
  'Brand colour': 'ब्रांड रंग',
  'Launcher position': 'लॉन्चर स्थिति',
  'Website Chat Widget': 'वेबसाइट चैट विजेट',
  'Plan name': 'प्लान का नाम',
  'Monthly price (INR)': 'मासिक कीमत (INR)',
  'Yearly price (INR)': 'वार्षिक कीमत (INR)',
  Features: 'सुविधाएं',
  'Add business': 'व्यवसाय जोड़ें',
  'Add customer': 'ग्राहक जोड़ें',
  'New appointment': 'नया अपॉइंटमेंट',
  'Assign staff': 'स्टाफ़ सौंपें',
  'Assign to': 'सौंपें',
  'Customer name': 'ग्राहक का नाम',
  'Service / interest': 'सेवा / रुचि',
  'Search name, phone, service': 'नाम, फ़ोन, सेवा खोजें',
  'Consultations and service slots. Double bookings are blocked automatically.':
    'परामर्श और सेवा स्लॉट। डबल बुकिंग अपने आप रुकती है।',
  'Book an appointment manually, or let the AI receptionist book it during a conversation.':
    'अपॉइंटमेंट मैन्युअल बुक करें, या बातचीत के दौरान AI रिसेप्शनिस्ट से बुक कराएं।',
  'Interested courses': 'इच्छुक कोर्स',
  'Follow-up date': 'फ़ॉलो-अप तारीख',
  'Start time': 'शुरू का समय',
  'Duration (minutes)': 'अवधि (मिनट)',
  'Contact email': 'संपर्क ईमेल',
  'Contact phone': 'संपर्क फ़ोन',
  'Reports & Analytics': 'रिपोर्ट्स और एनालिटिक्स',
  'Calls in view': 'दिख रही कॉल',
  'Talk time': 'बातचीत का समय',
  'Missed / failed': 'छूटी / असफल',
  'Open conversations': 'खुली बातचीत',

  // Auth
  'Sign in to your workspace': 'अपने वर्कस्पेस में साइन इन करें',
  'Manage your AI receptionist, leads and appointments.':
    'अपने AI रिसेप्शनिस्ट, लीड्स और अपॉइंटमेंट संभालें।',
  'Start your 14-day trial': 'अपना 14-दिन का ट्रायल शुरू करें',
  'Create your business workspace — no credit card required.':
    'अपना व्यवसाय वर्कस्पेस बनाएं — क्रेडिट कार्ड ज़रूरी नहीं।',
  'Back to website': 'वेबसाइट पर वापस',
  Back: 'वापस',
  'Sign in': 'साइन इन',
  'Forgot password?': 'पासवर्ड भूल गए?',
  'Create an account': 'खाता बनाएं',
  'Already have an account?': 'पहले से खाता है?',
  'New business?': 'नया व्यवसाय?',
  'Create workspace': 'वर्कस्पेस बनाएं',
  'Business name is required': 'व्यवसाय का नाम ज़रूरी है',
  'Your name is required': 'आपका नाम ज़रूरी है',
  'Email is required': 'ईमेल ज़रूरी है',
  'Password is required': 'पासवर्ड ज़रूरी है',
  'Email is required.': 'ईमेल ज़रूरी है।',
  'Phone is required': 'फ़ोन नंबर ज़रूरी है',
  'Enter a valid 10-digit Indian mobile number (starting with 6, 7, 8 or 9)':
    'सही 10 अंकों का भारतीय मोबाइल नंबर डालें (6, 7, 8 या 9 से शुरू)',
  'Please enter a valid 10-digit mobile number': 'कृपया सही 10 अंकों का मोबाइल नंबर डालें',
  'Mobile number': 'मोबाइल नंबर',
  'Demo accounts': 'डेमो खाते',
  'Choose how you want to sign in': 'चुनें कि आप कैसे साइन इन करना चाहते हैं',
  'Three separate sign-in portals keep platform, business and staff access apart.':
    'तीन अलग साइन-इन पोर्टल प्लेटफ़ॉर्म, व्यवसाय और स्टाफ़ का एक्सेस अलग रखते हैं।',
  'Super Admin': 'सुपर एडमिन',
  'Business Admin': 'व्यवसाय एडमिन',
  'Platform console, businesses, plans and audit logs.':
    'प्लेटफ़ॉर्म कंसोल, व्यवसाय, प्लान और ऑडिट लॉग।',
  'Your institute workspace: AI, leads, staff and billing.':
    'आपका संस्थान वर्कस्पेस: AI, लीड्स, स्टाफ़ और बिलिंग।',
  'Assigned leads, conversations and appointments.':
    'सौंपे गए लीड्स, बातचीत और अपॉइंटमेंट।',
  'Continue as Super Admin': 'सुपर एडमिन के रूप में जारी रखें',
  'Continue as Business Admin': 'व्यवसाय एडमिन के रूप में जारी रखें',
  'Continue as Staff': 'स्टाफ़ के रूप में जारी रखें',
  'Back to portal selection': 'पोर्टल चुनने पर वापस',
  'Verify your business email': 'अपना व्यवसाय ईमेल सत्यापित करें',
  'We sent a 6-digit code to': 'हमने 6 अंकों का कोड भेजा है',
  'Enter the code to activate your workspace and sign in.':
    'अपना वर्कस्पेस सक्रिय करने और साइन इन करने के लिए कोड डालें।',
  'Verification code': 'सत्यापन कोड',
  'Verify and sign in': 'सत्यापित करें और साइन इन करें',
  Verifying: 'सत्यापित हो रहा है',
  'Resend code': 'कोड दोबारा भेजें',
  'Sending…': 'भेज रहे हैं…',
  'Code sent again. Check your inbox.': 'कोड दोबारा भेज दिया। अपना इनबॉक्स देखें।',
  'Email verified. Opening your workspace…': 'ईमेल सत्यापित। आपका वर्कस्पेस खुल रहा है…',
  'Your business is not verified yet': 'आपका व्यवसाय अभी सत्यापित नहीं है',
  'verification code': 'सत्यापन कोड',
  'Enter the 6-digit code from your email': 'अपने ईमेल से 6 अंकों का कोड डालें',
  'Reset your password': 'अपना पासवर्ड रीसेट करें',
  'We will generate a secure reset link for your account.':
    'हम आपके खाते के लिए सुरक्षित रीसेट लिंक बनाएंगे।',
  'Send reset link': 'रीसेट लिंक भेजें',
  'Back to sign in': 'साइन इन पर वापस',
  'Choose a new password': 'नया पासवर्ड चुनें',
  'Your reset link is valid for one hour and can be used once.':
    'आपका रीसेट लिंक एक घंटे तक वैध है और एक बार इस्तेमाल हो सकता है।',
  'Reset token': 'रीसेट टोकन',
  'Update password': 'पासवर्ड अपडेट करें',
  'Password updated. Redirecting to sign in…': 'पासवर्ड अपडेट हुआ। साइन इन पर भेज रहे हैं…',
  'Development shortcut': 'डेवलपमेंट शॉर्टकट',
  'Open reset form': 'रीसेट फ़ॉर्म खोलें',

  // Landing
  Features: 'सुविधाएं',
  'How it works': 'यह कैसे काम करता है',
  Pricing: 'कीमत',
  'Live demo': 'लाइव डेमो',
  'Start free': 'मुफ़्त शुरू करें',
  'AI receptionist for every business': 'हर व्यवसाय के लिए AI रिसेप्शनिस्ट',
  'For your business': 'आपके व्यवसाय के लिए',
  'Built for': 'इनके लिए बना',
  'Clinics & dentists': 'क्लिनिक और दंत चिकित्सक',
  'Salons & spas': 'सैलून और स्पा',
  'Coaching centres': 'कोचिंग सेंटर',
  'Retail stores': 'रिटेल स्टोर',
  'Real estate': 'रियल एस्टेट',
  'Agencies & services': 'एजेंसियां और सेवाएं',
  'Hotels & travel': 'होटल और यात्रा',
  'Home services': 'होम सर्विस',
  'Your Business Never Misses a Customer.': 'आपका व्यवसाय कोई ग्राहक कभी नहीं खोता।',
  'Answer every call, WhatsApp message and website chat 24/7 with an AI front desk that knows your services, prices and timings — and books appointments while you work.':
    'हर कॉल, WhatsApp संदेश और वेबसाइट चैट का 24/7 जवाब दें — AI फ्रंट डेस्क आपकी सेवाएं, कीमतें और समय जानता है और काम के दौरान ही अपॉइंटमेंट भी बुक कर देता है।',
  'yourbusiness.com · AI receptionist': 'yourbusiness.com · AI रिसेप्शनिस्ट',
  'Hi, do you have a slot this Saturday?': 'नमस्ते, इस शनिवार कोई स्लॉट खाली है?',
  'Yes — Saturday has 11:00 AM and 4:00 PM open. Our standard service starts at ₹499. Shall I book 11:00 AM?':
    'हां — शनिवार को सुबह 11:00 और शाम 4:00 बजे खाली है। हमारी सामान्य सेवा ₹499 से शुरू होती है। क्या मैं 11:00 बजे बुक कर दूं?',
  '11 AM works, please.': '11 बजे ठीक है, बुक कर दीजिए।',
  'Booked for Saturday, 11:00 AM. I have saved your details — the team will confirm on WhatsApp shortly.':
    'शनिवार सुबह 11:00 बजे बुक हो गया। आपकी जानकारी सेव कर ली है — टीम जल्द WhatsApp पर पुष्टि करेगी।',
  'Enquiry captured · Appointment booked · No staff needed': 'पूछताछ दर्ज · अपॉइंटमेंट बुक · स्टाफ़ की ज़रूरत नहीं',
  'Start your free trial': 'अपना मुफ़्त ट्रायल शुरू करें',
  'Try the live chatbot': 'लाइव चैटबॉट आज़माएं',
  '14-day trial · No credit card · Website chat, WhatsApp and voice in one platform':
    '14-दिन ट्रायल · क्रेडिट कार्ड नहीं · वेबसाइट चैट, WhatsApp और वॉइस एक ही प्लेटफ़ॉर्म पर',
  'Everything in one front desk': 'सब कुछ एक फ्रंट डेस्क में',
  'Built for the way real businesses work': 'असली व्यवसाय जैसे चलते हैं, वैसे ही बना',
  'Replace missed calls and scattered WhatsApp chats with a single AI receptionist that captures, qualifies and routes every enquiry — whether you sell services, courses, appointments or products.':
    'छूटी कॉल और बिखरी WhatsApp चैट की जगह एक AI रिसेप्शनिस्ट, जो हर पूछताछ कैप्चर, क्वालिफ़ाई और सही जगह भेजता है — चाहे आप सेवाएं, कोर्स, अपॉइंटमेंट या प्रोडक्ट बेचते हों।',
  'Live in three steps': 'तीन स्टेप में लाइव',
  'Create your workspace': 'अपना वर्कस्पेस बनाएं',
  'Simple plans that grow with you': 'आपके साथ बढ़ने वाले आसान प्लान',
  'Every plan includes the website chatbot, knowledge base, lead CRM and appointments.':
    'हर प्लान में वेबसाइट चैटबॉट, नॉलेज बेस, लीड CRM और अपॉइंटमेंट शामिल हैं।',
  'AI front desk for your business.': 'आपके व्यवसाय के लिए AI फ्रंट डेस्क।',
  'Most popular': 'सबसे लोकप्रिय',
  'Start with': 'शुरू करें',
  'Stop losing enquiries after 7 PM': 'शाम 7 बजे के बाद पूछताछ मत खोएं',
  'Your AI receptionist answers instantly, in English or Hindi, and hands over to your team with full context when a human is needed.':
    'आपका AI रिसेप्शनिस्ट अंग्रेज़ी या हिंदी में तुरंत जवाब देता है और ज़रूरत पड़ने पर पूरी जानकारी के साथ आपकी टीम को सौंप देता है।',
  'Start free trial': 'मुफ़्त ट्रायल शुरू करें',
  'Chat with the live demo': 'लाइव डेमो से चैट करें',
  'No industry setup calls. Add what your business offers and the assistant speaks as your business.':
    'किसी industry-specific setup की ज़रूरत नहीं। अपने व्यवसाय की जानकारी जोड़ें और असिस्टेंट आपके व्यवसाय की तरह बात करेगा।',
  'Get started': 'शुरू करें',
  Demo: 'डेमो',
  'Website AI chatbot': 'वेबसाइट AI चैटबॉट',
  'WhatsApp automation': 'WhatsApp ऑटोमेशन',
  'AI voice receptionist': 'AI वॉइस रिसेप्शनिस्ट',
  'Lead CRM': 'लीड CRM',
  'Appointment booking': 'अपॉइंटमेंट बुकिंग',
  'Multi-tenant by design': 'मल्टी-टेनेंट डिज़ाइन',
  'Add your business facts': 'अपने व्यवसाय के तथ्य जोड़ें',
  'Train your front desk': 'अपना फ्रंट डेस्क ट्रेन करें',
  'Go live everywhere': 'हर जगह लाइव जाएं',
  'Services, prices, opening hours, FAQs and policies — or upload a PDF and let it chunk automatically.':
    'सेवाएं, कीमतें, खुलने का समय, FAQs और नियम — या PDF अपलोड करें, वह अपने आप बंट जाएगा।',
  'Set the tone, language, greeting and handoff rules for each AI receptionist agent.':
    'हर AI रिसेप्शनिस्ट एजेंट के लिए टोन, भाषा, अभिवादन और हैंडऑफ़ नियम सेट करें।',
  'Paste the widget code, connect WhatsApp or forward your number. Every enquiry is answered instantly.':
    'विजेट कोड लगाएं, WhatsApp जोड़ें या अपना नंबर फ़ॉरवर्ड करें। हर पूछताछ का तुरंत जवाब मिलेगा।',
  'An embeddable widget that answers from your verified services, prices and timings — then captures the enquiry as a lead.':
    'एक एम्बेड करने योग्य विजेट जो आपकी सत्यापित सेवाओं, कीमतों और समय से जवाब देता है — और पूछताछ को लीड के रूप में कैप्चर करता है।',
  'Official WhatsApp Business Cloud API webhooks route every conversation to the right business and reply with AI.':
    'आधिकारिक WhatsApp Business Cloud API वेबहुक हर बातचीत सही व्यवसाय तक भेजते हैं और AI से जवाब देते हैं।',
  'Twilio-compatible call handling with speech input, spoken answers, call transcripts and human transfer.':
    'Twilio-संगत कॉल हैंडलिंग, वॉइस इनपुट, बोले गए जवाब, ट्रांसक्रिप्ट और मानव ट्रांसफ़र के साथ।',
  'Every enquiry becomes a deduplicated lead with source, service interest, assignee and follow-up date.':
    'हर पूछताछ स्रोत, सेवा रुचि, असाइनी और फ़ॉलो-अप तारीख के साथ डुप्लीकेट-मुक्त लीड बनती है।',
  'The AI checks real availability, prevents double booking and confirms only after the appointment is saved.':
    'AI असली उपलब्धता देखता है, डबल बुकिंग रोकता है और अपॉइंटमेंट सेव होने के बाद ही पुष्टि करता है।',
  'Server-enforced tenant isolation, role-based access, audit logs and encrypted credentials per business.':
    'सर्वर-स्तर पर व्यवसाय अलगाव, भूमिका-आधारित एक्सेस, ऑडिट लॉग और हर व्यवसाय के एन्क्रिप्टेड क्रेडेंशियल।',
  'Coaching / Institute': 'कोचिंग / संस्थान',
  Healthcare: 'हेल्थकेयर',
  Hotels: 'होटल',
  'Real Estate': 'रियल एस्टेट',
  Salon: 'सैलून',
  Other: 'अन्य',
  Use: 'भरें',
  'Register again': 'दोबारा रजिस्टर करें',
  'The code expires in 15 minutes.': 'कोड 15 मिनट में समाप्त हो जाएगा।',
  'Email delivery is not configured, so the code is shown here:':
    'ईमेल डिलीवरी कॉन्फ़िगर नहीं है, इसलिए कोड यहां दिख रहा है:',
  'Open the verification link from your email, or register again.':
    'अपने ईमेल का सत्यापन लिंक खोलें, या दोबारा रजिस्टर करें।',
  'Enter your verification code': 'अपना सत्यापन कोड डालें',
  'Business Admin sign in': 'व्यवसाय एडमिन साइन इन',
  'Staff sign in': 'स्टाफ़ साइन इन',
  'Super Admin sign in': 'सुपर एडमिन साइन इन',
  'One AI receptionist for website chat, WhatsApp and phone calls — capturing leads, booking appointments and handing off to your team when it matters.':
    'वेबसाइट चैट, WhatsApp और फ़ोन कॉल के लिए एक AI रिसेप्शनिस्ट — लीड्स कैप्चर, अपॉइंटमेंट बुकिंग और ज़रूरत पर टीम को हैंडऑफ़।',
  'Grounded answers from your own knowledge base': 'आपके अपने नॉलेज बेस से सही जवाब',
  'Leads and appointments saved automatically': 'लीड्स और अपॉइंटमेंट अपने आप सेव',
  'Built for any industry — coaching, clinics, salons, retail and more': 'हर उद्योग के लिए — कोचिंग, क्लिनिक, सैलून, रिटेल और बहुत कुछ',
  'We will email a 6-digit verification code.': 'हम 6 अंकों का सत्यापन कोड ईमेल करेंगे।',
  '10-digit Indian number — no +91 needed.': '10 अंकों का भारतीय नंबर — +91 लिखने की ज़रूरत नहीं।',
  'Choose how you want to sign in': 'चुनें कि आप कैसे साइन इन करना चाहते हैं',
  'Three separate sign-in portals keep platform, business and staff access apart.':
    'तीन अलग साइन-इन पोर्टल प्लेटफ़ॉर्म, व्यवसाय और स्टाफ़ का एक्सेस अलग रखते हैं।',
  'Platform console, businesses, plans and audit logs.': 'प्लेटफ़ॉर्म कंसोल, व्यवसाय, प्लान और ऑडिट लॉग।',
  'Your workspace: AI, leads, staff and billing.': 'आपका वर्कस्पेस: AI, लीड्स, स्टाफ़ और बिलिंग।',
  'Page {page} of {pages}': 'पेज {page} / {pages}',
  '{count} records': '{count} रिकॉर्ड',
  'Enquiry trend': 'पूछताछ का रुझान',
  'Channel mix': 'चैनल मिश्रण',
  'Where your customers start conversations': 'आपके ग्राहक बातचीत कहां से शुरू करते हैं',
  'Latest leads': 'नवीनतम लीड्स',
  'Plan distribution': 'प्लान वितरण',
  'Businesses per subscription tier': 'हर सब्सक्रिप्शन टियर में व्यवसाय',
  'Newest businesses': 'नए व्यवसाय',
  'My workspace': 'मेरा वर्कस्पेस',
  'My leads': 'मेरे लीड्स',
  'Switch to': 'इस पर जाएं:',
  'Payment capture requires a connected gateway; invoices are recorded here either way.':
    'भुगतान के लिए गेटवे जोड़ना ज़रूरी है; इनवॉइस यहां हर हाल में रिकॉर्ड होते हैं।',
  'View all': 'सभी देखें',
};

/** Reads the saved language outside React (e.g. the axios error helper). */
export function getStoredLanguage() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'hi' ? 'hi' : 'en';
  } catch {
    return 'en';
  }
}

/** Pure translator, usable from non-component modules. */
export function translate(text, lang = getStoredLanguage()) {
  if (text === undefined || text === null) return text;
  const source = String(text);
  return lang === 'hi' ? HI[source] || source : source;
}

/**
 * Second batch: inline page labels and server/validation messages. Kept as a
 * separate object and merged in so the same key can never appear twice in one
 * object literal.
 */
Object.assign(HI, {
  'AI assistant · online': 'AI सहायक · ऑनलाइन',
  'All categories': 'सभी श्रेणियां',
  'All roles': 'सभी भूमिकाएं',
  'All severities': 'सभी गंभीरता स्तर',
  'All sources': 'सभी स्रोत',
  'All statuses': 'सभी स्थितियां',
  Appearance: 'दिखावट',
  Assign: 'सौंपें',
  'Bottom left': 'नीचे बाएं',
  'Bottom right': 'नीचे दाएं',
  Business: 'व्यवसाय',
  'Business admin (full access)': 'व्यवसाय एडमिन (पूरा एक्सेस)',
  'Business admin (optional)': 'व्यवसाय एडमिन (वैकल्पिक)',
  'Call history': 'कॉल इतिहास',
  'Changing your password signs out all other sessions.':
    'पासवर्ड बदलने पर बाकी सभी सेशन साइन आउट हो जाएंगे।',
  'Channel performance': 'चैनल प्रदर्शन',
  'Chat unavailable': 'चैट उपलब्ध नहीं',
  'Conversations started per channel': 'हर चैनल पर शुरू हुई बातचीत',
  'Daily enquiry flow': 'रोज़ की पूछताछ का प्रवाह',
  Default: 'डिफ़ॉल्ट',
  'Distribution by status': 'स्थिति के अनुसार वितरण',
  'Embed on your website': 'अपनी वेबसाइट पर एम्बेड करें',
  'Knowledge used': 'इस्तेमाल हुआ नॉलेज',
  'Lead pipeline': 'लीड पाइपलाइन',
  'Leads vs appointments created per day': 'रोज़ बने लीड्स बनाम अपॉइंटमेंट',
  'No appointments yet.': 'अभी कोई अपॉइंटमेंट नहीं।',
  'No conversations recorded.': 'कोई बातचीत रिकॉर्ड नहीं।',
  'No notes yet.': 'अभी कोई नोट नहीं।',
  'No transcript stored for this call.': 'इस कॉल का कोई ट्रांसक्रिप्ट सेव नहीं है।',
  'Operations snapshot': 'संचालन का सारांश',
  'Personal details': 'व्यक्तिगत जानकारी',
  'Preview': 'प्रीव्यू',
  'Report': 'रिपोर्ट',
  'Service quality and workload': 'सेवा गुणवत्ता और कार्यभार',
  'Staff (assigned work only)': 'स्टाफ़ (सिर्फ़ सौंपा गया काम)',
  Transcript: 'ट्रांसक्रिप्ट',
  Unassigned: 'असाइन नहीं',
  Voice: 'वॉइस',
  'Would escalate': 'एस्केलेट होगा',
  'Your assigned leads and upcoming appointments are ready.':
    'आपके सौंपे गए लीड्स और आगामी अपॉइंटमेंट तैयार हैं।',
  'Back to console': 'कंसोल पर वापस',

  // Server and validation messages (translated by lib/api.js)
  'Something went wrong': 'कुछ गड़बड़ हो गई',
  'Unable to sign in': 'साइन इन नहीं हो सका',
  'Unable to create your account': 'आपका खाता नहीं बन सका',
  'Invalid email or password': 'ईमेल या पासवर्ड गलत है',
  'Authentication required': 'साइन इन करना ज़रूरी है',
  'You do not have permission to perform this action': 'आपको यह काम करने की अनुमति नहीं है',
  'Your role does not allow this operation': 'आपकी भूमिका को यह काम करने की अनुमति नहीं है',
  'An account with this email already exists': 'इस ईमेल से खाता पहले से मौजूद है',
  'A user with this email already exists': 'इस ईमेल से उपयोगकर्ता पहले से मौजूद है',
  'A customer with this phone number already exists': 'इस फ़ोन नंबर से ग्राहक पहले से मौजूद है',
  'A plan with this code already exists': 'इस कोड से प्लान पहले से मौजूद है',
  'A super admin already exists': 'सुपर एडमिन पहले से मौजूद है',
  'Validation failed': 'जानकारी सही नहीं है',
  'Resource not found': 'जानकारी नहीं मिली',
  'User not found': 'उपयोगकर्ता नहीं मिला',
  'Lead not found': 'लीड नहीं मिली',
  'Customer not found': 'ग्राहक नहीं मिला',
  'Appointment not found': 'अपॉइंटमेंट नहीं मिला',
  'Conversation not found': 'बातचीत नहीं मिली',
  'AI agent not found': 'AI एजेंट नहीं मिला',
  'Knowledge entry not found': 'नॉलेज एंट्री नहीं मिली',
  'Document not found': 'दस्तावेज़ नहीं मिला',
  'Plan not found': 'प्लान नहीं मिला',
  'Business not found': 'व्यवसाय नहीं मिला',
  'Business account not found': 'व्यवसाय का खाता नहीं मिला',
  'Chat widget not found': 'चैट विजेट नहीं मिला',
  'No business is linked to this account': 'इस खाते से कोई व्यवसाय जुड़ा नहीं है',
  'Account is not active': 'खाता सक्रिय नहीं है',
  'Account no longer exists': 'खाता अब मौजूद नहीं है',
  'This account has been deactivated': 'यह खाता निष्क्रिय कर दिया गया है',
  'Business account is inactive': 'व्यवसाय का खाता निष्क्रिय है',
  'Business account is suspended': 'व्यवसाय का खाता सस्पेंड है',
  'Business account is not active': 'व्यवसाय का खाता सक्रिय नहीं है',
  'Cross-tenant access is not allowed': 'दूसरे व्यवसाय का डेटा देखने की अनुमति नहीं है',
  'Platform accounts cannot read business operational data': 'प्लेटफ़ॉर्म खाते व्यवसाय का संचालन डेटा नहीं देख सकते',
  'tenantId is required for platform access': 'प्लेटफ़ॉर्म एक्सेस के लिए tenantId ज़रूरी है',
  'Only a business admin can update the profile': 'प्रोफ़ाइल सिर्फ़ व्यवसाय एडमिन बदल सकता है',
  'Only a business admin can manage AI agents': 'AI एजेंट सिर्फ़ व्यवसाय एडमिन संभाल सकता है',
  'Only a business admin can delete customers': 'ग्राहक सिर्फ़ व्यवसाय एडमिन हटा सकता है',
  'Only a business admin can resume the AI': 'AI सिर्फ़ व्यवसाय एडमिन फिर शुरू कर सकता है',
  'You cannot deactivate your own account': 'आप अपना खाता निष्क्रिय नहीं कर सकते',
  'You cannot remove your own account': 'आप अपना खाता नहीं हटा सकते',
  'You cannot change your own account status': 'आप अपने खाते की स्थिति नहीं बदल सकते',
  'Current password is incorrect': 'मौजूदा पासवर्ड गलत है',
  'Session expired, please sign in again': 'सेशन समाप्त हो गया, कृपया दोबारा साइन इन करें',
  'Refresh token missing': 'सेशन टोकन नहीं मिला',
  'This reset link is invalid or has expired': 'यह रीसेट लिंक गलत या समाप्त है',
  'Super admin bootstrap is disabled': 'सुपर एडमिन बूटस्ट्रैप बंद है',
  'Invalid setup key': 'सेटअप कुंजी गलत है',
  'This code has expired. Request a new verification code.':
    'यह कोड समाप्त हो गया। नया सत्यापन कोड मांगें।',
  'That verification code is incorrect': 'यह सत्यापन कोड गलत है',
  'This email is already verified. Please sign in.': 'यह ईमेल पहले ही सत्यापित है। कृपया साइन इन करें।',
  'This verification request is invalid or has expired': 'यह सत्यापन अनुरोध गलत या समाप्त है',
  'Too many incorrect attempts. Request a new verification code.':
    'बहुत बार गलत कोड डाला। नया सत्यापन कोड मांगें।',
  'Please wait a minute before requesting another code': 'दूसरा कोड मांगने से पहले एक मिनट रुकें',
  'Too many authentication attempts. Please try again in a few minutes.':
    'बहुत बार साइन इन की कोशिश हुई। कुछ मिनट बाद दोबारा कोशिश करें।',
  'Too many requests. Please slow down.': 'बहुत ज़्यादा अनुरोध। कृपया थोड़ा रुकें।',
  'Application not configured': 'एप्लिकेशन कॉन्फ़िगर नहीं है',
  'Database connection failed. Please try again.': 'डेटाबेस से कनेक्ट नहीं हो पाया। दोबारा कोशिश करें।',
  'Service temporarily unavailable': 'सेवा अभी उपलब्ध नहीं है',
  'End time must be after start time': 'समाप्ति समय शुरू के बाद होना चाहिए',
  'Invalid appointment time': 'अपॉइंटमेंट का समय सही नहीं है',
  'Invalid date or time': 'तारीख या समय सही नहीं है',
  'Assignee must be an active team member': 'असाइनी सक्रिय टीम सदस्य होना चाहिए',
  'This appointment is not assigned to you': 'यह अपॉइंटमेंट आपको सौंपा नहीं गया',
  'Keep at least one AI agent': 'कम से कम एक AI एजेंट रखें',
  'Unknown provider': 'प्रदाता ज्ञात नहीं',
  'Integration not configured': 'इंटीग्रेशन कॉन्फ़िगर नहीं है',
  'No file uploaded': 'कोई फ़ाइल अपलोड नहीं हुई',
  'visitorId is required': 'visitorId ज़रूरी है',
  'This chat widget is currently unavailable': 'यह चैट विजेट अभी उपलब्ध नहीं है',
  'This chat widget is disabled': 'यह चैट विजेट बंद है',
  'Password must be at least 8 characters': 'पासवर्ड कम से कम 8 अक्षरों का होना चाहिए',
  'Password must contain a letter': 'पासवर्ड में एक अक्षर होना चाहिए',
  'Password must contain a number': 'पासवर्ड में एक अंक होना चाहिए',
});

Object.assign(HI, {
  'just now': 'अभी',
  Refresh: 'रिफ़्रेश',
  '7 days': '7 दिन',
  '14 days': '14 दिन',
  '30 days': '30 दिन',
  '90 days': '90 दिन',
  New: 'नया',
  Contacted: 'संपर्क हुआ',
  Interested: 'इच्छुक',
  'Demo Scheduled': 'डेमो निर्धारित',
  Converted: 'कन्वर्ट हुआ',
  'Not Interested': 'इच्छुक नहीं',
  Lost: 'खो गया',
  Scheduled: 'निर्धारित',
  Confirmed: 'पुष्ट',
  Completed: 'पूरा हुआ',
  Cancelled: 'रद्द',
  Rescheduled: 'फिर से निर्धारित',
  'No Show': 'नहीं आया',
  Closed: 'बंद',
  Handoff: 'हैंडऑफ़',
  Suspended: 'सस्पेंड',
  Trialing: 'ट्रायल में',
  Paid: 'भुगतान हुआ',
  Failed: 'असफल',
  Connected: 'जुड़ा है',
  Disconnected: 'जुड़ा नहीं',
  Error: 'त्रुटि',
  Ready: 'तैयार',
  Processing: 'प्रोसेस हो रहा है',
  Missed: 'छूटी',
  'In Progress': 'चल रहा है',
  Transferred: 'ट्रांसफ़र हुआ',
  Voice: 'वॉइस',
  WhatsApp: 'WhatsApp',
  Website: 'वेबसाइट',
  Draft: 'ड्राफ़्ट',
  Sent: 'भेजा गया',
  Read: 'पढ़ा गया',
  Answered: 'उत्तर दिया',
  Coaching: 'कोचिंग',
  Healthcare: 'हेल्थकेयर',
  Hotels: 'होटल',
  'Real Estate': 'रियल एस्टेट',
  Salon: 'सैलून',
  Other: 'अन्य',
  'Inbound': 'इनबाउंड',
  'Outbound': 'आउटबाउंड',
  'Follow Up': 'फ़ॉलो-अप',
  Demo: 'डेमो',
  Counselling: 'काउंसलिंग',
  Admission: 'एडमिशन',
  Offline: 'ऑफ़लाइन',
  Online: 'ऑनलाइन',
  Hybrid: 'हाइब्रिड',
  'Friendly': 'मिलनसार',
  Professional: 'पेशेवर',
  Enthusiastic: 'उत्साही',
  '{count} awaiting first contact': '{count} पहले संपर्क की प्रतीक्षा में',
  '{count} escalated to staff': '{count} स्टाफ़ को भेजे गए',
  '{count} upcoming': '{count} आगामी',
  '{count} AI replies': '{count} AI जवाब',
  '{count} new to contact': '{count} नए, संपर्क बाकी',
  '{count} handed to staff': '{count} स्टाफ़ को सौंपे',
  '{count} AI replies in 14 days': '14 दिनों में {count} AI जवाब',
  '{count} new this month': 'इस महीने {count} नए',
  '{admins} admins · {staff} staff': '{admins} एडमिन · {staff} स्टाफ़',
  '₹{amount} collected': '₹{amount} वसूले',
  '{count} voice minutes': '{count} वॉइस मिनट',
  'Welcome back, {name}': 'वापसी पर स्वागत, {name}',
  there: 'आपका',
  'Platform health, revenue and AI usage across all businesses.':
    'प्लेटफ़ॉर्म की स्थिति, राजस्व और सभी व्यवसायों में AI उपयोग।',
  'Your assigned leads, conversations and appointments.': 'आपको सौंपे गए लीड्स, बातचीत और अपॉइंटमेंट।',
  'How your AI receptionist performed and what needs your attention.':
    'आपके AI रिसेप्शनिस्ट का प्रदर्शन और आपको किन चीज़ों पर ध्यान देना है।',
  'Improve AI answers': 'AI जवाब बेहतर करें',
  'Full report': 'पूरी रिपोर्ट',
  'Leads, conversations and appointments over the last 14 days':
    'पिछले 14 दिनों के लीड्स, बातचीत और अपॉइंटमेंट',
  'Platform console': 'प्लेटफ़ॉर्म कंसोल',
  Workspace: 'वर्कस्पेस',
});

// Public website chat (visitor-facing widget page).
Object.assign(HI, {
  'replies instantly': 'तुरंत जवाब',
  'AI assistant': 'AI सहायक',
  'Book appointment': 'अपॉइंटमेंट बुक करें',
  'Phone number': 'फ़ोन नंबर',
  'Confirm appointment': 'अपॉइंटमेंट पक्का करें',
  'Booking…': 'बुक हो रहा है…',
  'thinking…': 'सोच रहा है…',
  'Ask about services, prices or an appointment…': 'सेवाओं, कीमतों या अपॉइंटमेंट के बारे में पूछें…',
  'This chat is unavailable': 'यह चैट उपलब्ध नहीं है',
  'Message could not be sent': 'संदेश नहीं भेजा जा सका',
  'Could not book this slot': 'यह स्लॉट बुक नहीं हो सका',
  'Our team will get back to you shortly.': 'हमारी टीम जल्द ही आपसे संपर्क करेगी।',
  'A team member has been notified and will join this conversation.':
    'टीम के सदस्य को सूचित कर दिया गया है, वे इस बातचीत से जुड़ेंगे।',
  'Appointment booked for {when}.': '{when} के लिए अपॉइंटमेंट बुक हो गया।',
  'Appointment booked for {when}. See you there!': '{when} के लिए अपॉइंटमेंट बुक हो गया। मिलते हैं!',
  'Powered by Unique AI Frontdesk': 'Unique AI Frontdesk द्वारा संचालित',
  'Welcome message (Hindi)': 'स्वागत संदेश (हिन्दी)',
  'Shown to visitors viewing the chat in Hindi. Leave blank to show the English message.':
    'जो विज़िटर चैट हिन्दी में देखते हैं उन्हें यह दिखेगा। खाली छोड़ने पर अंग्रेज़ी संदेश दिखेगा।',
});

// Field-level help text that explains what to enter while training the AI.
Object.assign(HI, {
  'A short name your team will recognise.': 'ऐसा छोटा नाम जो आपकी टीम पहचान सके।',
  'One line about what this agent handles.': 'एक पंक्ति में बताएं कि यह एजेंट क्या संभालता है।',
  'The first message a customer sees. Keep it short and friendly.':
    'ग्राहक को दिखने वाला पहला संदेश। छोटा और मिलनसार रखें।',
  'How the AI sounds in every reply.': 'हर जवाब में AI का लहज़ा कैसा हो।',
  'Language the AI replies in. Pick Hinglish for mixed Hindi-English customers.':
    'AI किस भाषा में जवाब दे। हिन्दी-अंग्रेज़ी मिले ग्राहकों के लिए Hinglish चुनें।',
  'Your own notes on style, for example: patient and never pushy.': 'शैली पर अपने शब्दों में नोट, जैसे: धैर्यवान और कभी दबाव न डालने वाला।',
  'Used for AI phone calls. Pick the voice that fits your brand.':
    'AI फ़ोन कॉल के लिए। अपने ब्रांड के अनुसार आवाज़ चुनें।',
  'Rules the AI must follow: what to offer, what to avoid, and when to hand over to a human. Never promise fees or policies you have not added to the Knowledge Base.':
    'AI के लिए नियम: क्या पेश करना है, क्या नहीं, और कब किसी इंसान को सौंपना है। जो फीस या नियम नॉलेज बेस में नहीं हैं, उनका वादा कभी न करें।',
  'Where this agent answers. Website chat works right away; WhatsApp and voice need setup.':
    'यह एजेंट कहां जवाब देगा। वेबसाइट चैट तुरंत चलती है; WhatsApp और वॉइस के लिए सेटअप चाहिए।',
  'Chats and calls are handed to this number when a customer asks for a human.':
    'ग्राहक के इंसान मांगने पर चैट/कॉल इस नंबर पर भेजे जाएंगे।',
  'Pick the section this fact belongs to.': 'यह जानकारी किस श्रेणी की है, चुनें।',
  'Short label, for example Fees or Opening hours.': 'छोटा शीर्षक, जैसे फीस या खुलने का समय।',
  'Write the exact facts the AI may quote: prices, timings, address and policies. One topic per entry works best.':
    'वही तथ्य लिखें जो AI ग्राहक को बता सकता है: कीमतें, समय, पता और नियम। एक एंट्री में एक ही विषय सबसे अच्छा रहता है।',
  'First message visitors see. Mention what you help with and your timings.':
    'विज़िटर को दिखने वाला पहला संदेश। बताएं कि आप किसमें मदद करते हैं और समय क्या है।',
  'Used for the chat button and message bubbles.': 'चैट बटन और संदेशों के रंग में उपयोग होता है।',
  'Where the chat button appears on your website.': 'आपकी वेबसाइट पर चैट बटन कहां दिखेगा।',
  'Shown to customers and used when the AI introduces your business.':
    'ग्राहकों को दिखता है और AI परिचय देते समय इसका उपयोग करता है।',
  'Two or three lines about what you do. The AI uses this to introduce your business.':
    'दो-तीन पंक्तियों में बताएं कि आप क्या करते हैं। AI इसी से आपके व्यवसाय का परिचय देता है।',
  'The number the AI shares with customers.': 'यही नंबर AI ग्राहकों को देता है।',
  'The address the AI gives customers who ask for email.': 'ग्राहक ईमेल मांगे तो AI यही पता देता है।',
  'Shared when a customer asks for your website.': 'ग्राहक वेबसाइट मांगे तो यही लिंक दिया जाता है।',
  'Paste your Google Maps share link so the AI can send directions.':
    'अपना Google Maps शेयर लिंक डालें ताकि AI रास्ता भेज सके।',
  'Full address the AI can share, including a landmark.':
    'पूरा पता जो AI बता सके, लैंडमार्क के साथ।',
  'The AI only offers appointments within your working hours.':
    'AI सिर्फ़ आपके काम के घंटों में ही अपॉइंटमेंट देता है।',
  'Days you are open. Closed days are never offered for appointments.':
    'जिन दिन आप खुले हैं। बंद दिनों में अपॉइंटमेंट कभी नहीं दिया जाता।',
  'Languages the AI can reply in, comma separated.':
    'AI किन भाषाओं में जवाब दे सकता है, कॉमा से अलग करें।',
  'Steps a customer follows after showing interest. The AI explains these when asked.':
    'रुचि दिखाने के बाद ग्राहक किन चरणों से गुज़रता है। पूछने पर AI यही बताता है।',
  'Any guarantee, after-sales help or extra service you offer. The AI shares this when asked.':
    'आप जो गारंटी, बिक्री के बाद सहायता या अतिरिक्त सेवा देते हैं। पूछने पर AI यही बताता है।',
  'Add every course with its fee and batch timings — the AI answers fee, duration and batch questions from here.':
    'हर कोर्स उसकी फीस और बैच समय के साथ जोड़ें — फीस, अवधि और बैच से जुड़े सवाल AI यहीं से जवाब देता है।',
  'Name as customers know it.': 'वही नाम जो ग्राहक जानते हैं।',
  'Total fee as you quote it.': 'कुल फीस, जैसे आप ग्राहकों को बताते हैं।',
  'For example: 3 months.': 'जैसे: 3 महीने।',
  'Comma separated, for example: 7 AM, 6 PM.': 'कॉमा से अलग करें, जैसे: सुबह 7, शाम 6।',
  'Short list of topics covered. The AI shares this when asked.':
    'विषयों की छोटी सूची। पूछने पर AI यही बताता है।',
  '10-digit mobile number, used for calls and WhatsApp.':
    '10 अंकों का मोबाइल नंबर, कॉल और WhatsApp के लिए।',
  'What the customer asked about.': 'ग्राहक ने किस बारे में पूछा था।',
  'Where this enquiry came from.': 'यह पूछताछ कहां से आई।',
  'Current stage of your follow-up.': 'फ़ॉलो-अप का मौजूदा चरण।',
  'Staff member responsible for this lead.': 'इस लीड के ज़िम्मेदार स्टाफ सदस्य।',
  'Date for the next follow-up call.': 'अगली फ़ॉलो-अप कॉल की तारीख।',
  'Anything the next person should know before calling.':
    'कॉल से पहले अगले व्यक्ति को जो पता होना चाहिए।',
  'Comma separated, for example: Python, Excel.': 'कॉमा से अलग करें, जैसे: पाइथन, एक्सेल।',
  'Comma separated labels for grouping, for example: hot, repeat.':
    'ग्रुपिंग के लिए लेबल, कॉमा से अलग, जैसे: hot, repeat।',
  'What the customer is coming in for.': 'ग्राहक किस काम के लिए आ रहा है।',
  'What kind of visit this is.': 'यह किस तरह की विज़िट है।',
  'How long the slot stays blocked in the calendar.':
    'कैलेंडर में स्लॉट कितनी देर ब्लॉक रहेगा।',
  'Only your team sees these notes.': 'ये नोट्स सिर्फ़ आपकी टीम देखती है।',
  'They will sign in with this email.': 'इसी ईमेल से वे साइन इन करेंगे।',
  'Optional contact number for this team member.': 'इस टीम सदस्य के लिए वैकल्पिक संपर्क नंबर।',
  'Shown next to their name across the app.': 'ऐप में उनके नाम के आगे दिखता है।',
  'Staff see only work assigned to them; business admins manage everything.':
    'स्टाफ़ को सिर्फ़ अपना काम दिखता है; बिज़नेस एडमिन सब कुछ संभालते हैं।',
  'Email cannot be changed here.': 'ईमेल यहां से नहीं बदला जा सकता।',
  'Optional contact number for your account.': 'आपके खाते के लिए वैकल्पिक संपर्क नंबर।',
  'Shown to your team.': 'आपकी टीम को दिखता है।',
  'The business admin signs in with this email.': 'बिज़नेस एडमिन इसी ईमेल से साइन इन करता है।',
  'Used for account contact and support.': 'खाते के संपर्क और सहायता के लिए।',
  'Limits AI messages, agents and staff seats for this business.':
    'इस व्यवसाय के लिए AI संदेश, एजेंट और स्टाफ सीट की सीमा तय करता है।',
  'Use 0 for a free plan.': 'मुफ़्त प्लान के लिए 0 डालें।',
  'Total charged once a year.': 'साल में एक बार लिया जाने वाला कुल शुल्क।',
  'How many AI replies this plan allows each month.': 'यह प्लान हर महीने कितने AI जवाब देने देता है।',
  'Maximum number of AI receptionists.': 'AI रिसेप्शनिस्ट की अधिकतम संख्या।',
  'Maximum team logins for one business.': 'एक व्यवसाय के लिए अधिकतम टीम लॉगिन।',
  'Maximum knowledge base entries.': 'नॉलेज बेस में अधिकतम एंट्री।',
  'Included AI call minutes.': 'शामिल AI कॉल मिनट।',
  'Included WhatsApp messages.': 'शामिल WhatsApp संदेश।',
  'Comma separated, shown on the pricing page.': 'कॉमा से अलग करें, प्राइसिंग पेज पर दिखता है।',
});

const I18nContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'hi') return saved;
    } catch {
      /* ignore */
    }
    return 'en';
  });

  const setLang = useCallback((next) => {
    const value = next === 'hi' ? 'hi' : 'en';
    setLangState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback(
    (text, vars) => {
      if (text === undefined || text === null) return text;
      const source = String(text);
      let output = translate(source, lang);
      if (vars && typeof vars === 'object') {
        output = output.replace(/\{(\w+)\}/g, (match, key) => (vars[key] !== undefined ? String(vars[key]) : match));
      }
      return output;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t, isHindi: lang === 'hi' }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside LanguageProvider');
  return context;
}

export function LanguageSwitcher({ className = '', tone = 'light' }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      className={`inline-flex items-center rounded-xl border p-0.5 ${
        tone === 'dark' ? 'border-white/15 bg-white/5' : 'border-slate-200 bg-white'
      } ${className}`}
      role="group"
      aria-label={t('Change language')}
    >
      {LANGUAGES.map((language) => (
        <button
          key={language.code}
          type="button"
          onClick={() => setLang(language.code)}
          aria-pressed={lang === language.code}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
            lang === language.code
              ? tone === 'dark'
                ? 'bg-white text-slate-900'
                : 'bg-brand-600 text-white'
              : tone === 'dark'
                ? 'text-slate-300 hover:text-white'
                : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {language.label}
        </button>
      ))}
    </div>
  );
}
