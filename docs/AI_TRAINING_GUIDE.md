# AI Receptionist — Business-wise Training Guide

> यह document बताता है कि इस project का AI receptionist **कैसे काम करता है** और किसी भी नए business (coaching, clinic, hotel, real estate, salon…) के लिए उसे **step by step कैसे train** करना है — बिना code बदले, सिर्फ़ dashboard से।
>
> लक्ष्य: customer के हर सवाल का जवाब **सिर्फ़ verified business data से** मिले, गलत fee/timing/availability कभी invent न हो, और जहाँ AI confident न हो वहाँ conversation इंसान के पास (handoff) चली जाए।

---

## 1. AI actually कैसे काम करता है

जब कोई customer website widget या direct chat link से message भेजता है, तो यह pipeline चलती है:

```
Customer message
      │
      ▼
[1] Conversation बनती/मिलती है (tenant + visitorId/channel से)
      │
      ▼
[2] Message DB में save + unread count बढ़ता है
      │
      ▼
[3] Knowledge retrieval — उस tenant के enabled entries में से top 6 सबसे relevant
      │        (title/tags/content token match + exact phrase bonus)
      ▼
[4] Context बनता है:
      • Business Profile (नाम, about, phone, address, working days/hours, languages)
      • Courses (name, fee, duration, batch timings, mode)
      • Demo available / admission process / placement info
      • AI Agent (name, tone, language, owner instructions)
      • Top knowledge entries
      │
      ▼
[5] AI reply generate होती है
      • OPENAI_API_KEY set है  → GPT-4o-mini (temperature 0.3, JSON output)
      • key नहीं है            → deterministic "grounded fallback"
      │
      ▼
[6] Side-effects (जब AI को data मिले):
      • Lead/Customer capture (नाम/phone/email/course)
      • Demo appointment booking (45 min, business rules के हिसाब से)
      • Escalation → conversation "handoff", AI बंद, team को notification
      │
      ▼
[7] AI reply + sources save, UsageLog में 1 AI reply गिना जाता है
```

### 1.1 दो modes — यह समझना ज़रूरी है

| | OpenAI mode | Grounded fallback mode |
|---|---|---|
| कब | `.env` में `OPENAI_API_KEY` set हो | key नहीं है / provider fail हो |
| जवाब | Natural, multi-turn, language-aware | सबसे relevant knowledge entry का text (score ≥ 3 हो तो), वरना polite escalation |
| Booking/lead extraction | AI JSON से | सीमित (जो entry में लिखा है वही) |
| Training का असर | Knowledge + profile + instructions तीनों | Knowledge entries सबसे ज़्यादा मायने रखती हैं |

Fallback mode भी झूठ नहीं बोलता — बस जवाब knowledge entry का verbatim text होता है। इसलिए **training का 80% काम अच्छी knowledge entries लिखना है**, key हो या न हो।

**Key set करना (optional, production के लिए recommended):**

```bash
# .env (local) या Vercel → Project Settings → Environment Variables
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

बदलाव के बाद server restart करें। Key के बिना भी पूरा flow (widget → knowledge answer → lead → appointment → handoff) काम करता है।

### 1.2 Knowledge retrieval का scoring (training की रणनीति इसी से बनती है)

हर enabled entry को query tokens पर score मिलता है:

| Match | Points |
|---|---|
| Query token title में | +4 |
| Query token tags में | +3 |
| Query token content में | +1 |
| पूरा query phrase content में | +6 |
| पूरा query phrase title में | +5 |
| category = `business` | +0.5 |

Top 6 entries model को दी जाती हैं। Fallback mode में सिर्फ़ तभी जवाब देता है जब best score **≥ 3** हो — यानी customer के शब्द title/tags में होने चाहिए।

➡️ **Rule of thumb:** title में customer के actual बोलने वाले शब्द रखें ("Python course fees", "admission process", "demo class timing"), न कि internal नाम ("Course Master v3").

---

## 2. Training के 3 layers (क्या-क्या भरना है)

| Layer | Dashboard page | AI इसे कैसे use करता है | बदलने पर असर |
|---|---|---|---|
| **1. Business Profile** | Business Settings (`/app/settings`) | हर reply के context में पूरा profile + courses जाता है | तुरंत (next message से) |
| **2. AI Agent** | AI Receptionist (`/app/ai-agents`) | Personality, tone, language, greeting, owner instructions | तुरंत |
| **3. Knowledge Base** | Knowledge Base (`/app/knowledge`) | Query पर top 6 entries retrieve होकर context में जाती हैं | तुरंत (version बढ़ता है) |

तीनों tenant-scoped हैं — एक business का data दूसरे को कभी नहीं दिखता/मिलता।

---

## 3. Step-by-step: नया business train करना

> उदाहरण के तौर पर Section 5 में "Unique Computers" (coaching institute) का पूरा worked example है। हर business के लिए यही 8 stages दोहराएँ।

### Stage 0 — पहले data इकट्ठा करें (30–45 मिनट)

Dashboard खोलने से पहले business owner से यह list लिखवा लें:

- [ ] Business का पूरा नाम, 2–3 line का about (क्या करते हैं, कब से, किसके लिए)
- [ ] Phone, WhatsApp, email, website, full address, Google Maps link
- [ ] Opening/closing time, working days, holidays (अगले 3 महीने)
- [ ] बोली जाने वाली languages (English / Hindi / Hinglish)
- [ ] हर course/service: नाम, category, **exact fee**, duration, batch timings, online/offline/hybrid, syllabus summary
- [ ] Demo/trial available है या नहीं, admission/enrolment process
- [ ] Placement/result info (अगर हो)
- [ ] Top 20 customer सवाल जो WhatsApp/call पर सबसे ज़्यादा आते हैं
- [ ] किन मामलों में इंसान को जवाब देना चाहिए (complaint, discount, refund, special case)
- [ ] कौन से जवाब AI को **कभी** नहीं देने (negotiation, legal, medical advice…)

### Stage 1 — Business Settings भरें

Path: **Login → Business Settings** (`/app/settings`)

| Field | क्या भरें | क्यों ज़रूरी है |
|---|---|---|
| Business name | Exact public name | AI introduction में जाता है |
| About the business | 3–5 line, factual | AI इसी से business introduce करता है |
| Phone / Email / Website | सही contact | Contact intent के जवाब |
| Google Maps link | location link | Address पूछने पर |
| Address / City / State / Country | पूरा | Location answers |
| Opening / Closing time | actual hours | **Appointment booking इसी से validate होती है** |
| Working days | Mon–Sun में से असली days | बंद दिन पर booking block होती है |
| Languages | comma separated (English, Hindi) | AI customer की language follow करता है |
| Holidays | date + label | उस दिन booking block |
| Courses | name, category, fee, duration, batch timings, mode, syllabus, active | Fee/timing के हर जवाब का source |
| Demo available | on/off | Demo offer करने की permission |
| Admission process | steps | "Admission kaise le?" का जवाब |
| Placement info | facts only | Placement के दावे |

**Save changes** दबाएँ — profile तुरंत अगले AI reply से use होने लगती है।

⚠️ **सबसे आम गलती:** courses खाली छोड़ देना और fee सिर्फ़ knowledge entry में लिखना। दोनों जगह एक जैसी, updated fee रखें — profile हर reply में जाती है, entry सिर्फ़ match होने पर।

### Stage 2 — AI Receptionist configure करें

Path: **AI Receptionist** (`/app/ai-agents`) → agent edit करें (Starter plan में 1 agent)

| Field | सुझाव |
|---|---|
| Agent name | Customer को दिखने वाला नाम, जैसे "Unique Assistant" |
| Description | Internal note — किसके लिए है |
| Greeting | 1 line, action-oriented: "Namaste! Unique Computers mein aapka swagat hai. Course, fees ya demo — kya jaanna chahenge?" |
| Tone | friendly / professional / enthusiastic |
| Language | "Hindi + English (Hinglish)" जैसा natural description |
| Personality | "Warm, patient, concise. Parents aur students dono se respectfully baat kare." |
| **Business instructions** | सबसे powerful field (max 8000 chars) — guardrails यहाँ लिखें |
| Enabled channels | Website ON; WhatsApp/Voice तभी जब integration configure हो |
| Transfer number | Handoff के लिए staff/owner number |
| Is active / default | ON रखें |

**Business instructions का अच्छा template** (coaching के लिए):

```
- हमेशा Hindi/Hinglish में जवाब दें जब customer Hindi में पूछे; English में पूछे तो English.
- Fees, batch timing, discount, seat availability सिर्फ़ दिए गए business data से बताएँ. कभी अंदाज़ा न लगाएँ.
- Discount, fee negotiation, refund, certificate validity और complaint पर तुरंत human के पास भेजें.
- Demo class book करने से पहले customer का नाम, phone और course पूछें.
- एक reply में ज़्यादा से ज़्यादा 2-3 वाक्य; एक साफ़ next step.
- Placement का कोई guarantee न दें; सिर्फ़ official placement info दोहराएँ.
- Customer गुस्से में हो, human माँगे, या सवाल data से बाहर हो → escalate करें.
```

❌ **बुरा template:** "Be helpful and answer all questions about our institute." — इसमें कोई guardrail नहीं, model invent कर सकता है।

**Playground (यहीं training का पहला test होता है):** agent card → test/playground → सवाल पूछें। Result में दिखता है:

- `reply` — customer को क्या जाएगा
- `intent`, `confidence`, `mode` (openai/fallback)
- `Would escalate` chip
- `knowledgeUsed` — कौन सी entries match हुईं और कितना score

अगर `knowledgeUsed` खाली है → उस सवाल की knowledge entry नहीं है (Stage 3 में जोड़ें)।
Playground कुछ save नहीं करता, इसलिए बेझिझक test करें।

### Stage 3 — Knowledge Base entries लिखें (training का मुख्य हिस्सा)

Path: **Knowledge Base → Add entry**

Fields: **Category, Title, Content, Tags** (`isEnabled` toggle बाद में)

Categories: `business`, `course`, `fee`, `faq`, `policy`, `timing`, `contact`, `other`

#### Entry लिखने के 7 नियम

1. **एक entry = एक topic.** "Fees + timing + address" एक में न लिखें — retrieval इसे अलग-अलग match नहीं कर पाएगा।
2. **Title में customer के शब्द** रखें: "Python course fees", "Demo class kaise book kare", "Weekend batch timing".
3. **Content में exact numbers** — fee ₹, duration, timing, address, phone. "Affordable" या "sometime" जैसे शब्द न लिखें।
4. **Tags में synonyms** डालें — जो शब्द customer बोल सकता है: `fees, price, kitna, charge, cost`.
5. **50–300 शब्द** रखें। बहुत लंबी entry में retrieval score कमज़ोर पड़ता है और model ध्यान भटकता है।
6. **हर entry एक verified source से** — owner ने confirm किया हो। अंदाज़ा कभी नहीं।
7. **पुरानी entry delete/disable करें**, edit करके contradiction न छोड़ें। Disable करने से retrieval से तुरंत हट जाती है।

#### अच्छा vs बुरा उदाहरण

**❌ बुरा**
```
Title: Course info
Content: We have many computer courses with good fees and flexible timings. Contact us for details.
```
(कोई score नहीं, कोई exact fact नहीं → AI escalate करेगा)

**✅ अच्छा**
```
Category: fee
Title: Python Programming course fees and duration
Tags: python, fees, price, kitna, charge, duration, course
Content: Python Programming course ki fees ₹12,000 hai (total, one-time).
Duration 3 months, weekdays Mon-Fri. Batch timings: 8:00 AM, 11:00 AM aur 5:00 PM.
Mode: offline (Jaipur centre) aur online dono available. Installment: 2 installments allowed.
Registration fee ₹1,000 (course fee ke alawa).
```

**✅ अच्छा (policy)**
```
Category: policy
Title: Refund and fee transfer policy
Tags: refund, cancellation, fees return, transfer
Content: Admission ke 7 din ke andar refund request par 90% fee refund hoti hai (registration fee non-refundable).
7 din ke baad refund nahi. Batch change ya course transfer ek baar free hai, subject to seat availability.
Refund request centre par written form se karni hogi.
```

#### Entry bank — हर business के लिए minimum set (~25–40 entries)

| Category | ज़रूरी entries |
|---|---|
| `business` | Business क्या है, कब से, किसके लिए; locations; faculty/team (अगर public) |
| `course` | हर course/service की एक entry: syllabus, duration, mode |
| `fee` | हर course की exact fee, installment, registration fee, कोई hidden charge |
| `timing` | Batch timings (weekday/weekend), class duration, holiday policy |
| `policy` | Refund, cancellation, transfer, late fee, certificate rules |
| `faq` | Top 10–15 repeat सवाल: demo कैसे, admission कैसे, documents क्या, certificate मिलेगा?, placement? |
| `contact` | Phone/WhatsApp/email, address + landmark, maps link, office hours |
| `other` | Special offers (validity के साथ), scholarship, EMI, transport/hostel info |

### Stage 4 — Document upload (optional, तेज़ shortcut)

Path: **Knowledge Base → Upload document** — PDF, TXT, MD, CSV (max **8 MB**, एक बार में एक file)

क्या होता है:
- Text extract होकर ~1200 characters के chunks में बँटता है (max 200 chunks)
- हर chunk एक entry बनती है: category `other`, title `"filename - part N"`, tag `document`
- Entries tab में तुरंत दिखती हैं; Documents tab में status `ready`/`failed`
- Document delete करने पर उसकी सारी entries भी हट जाती हैं

⚠️ Upload सिर्फ़ **छोटे, साफ़** brochure/syllabus/fee-sheet के लिए अच्छा है। बड़ी PDF में headings और tables बिगड़ सकते हैं — उसके बाद हर entry का **title/category/tags ठीक करें**, वरना retrieval कमज़ोर रहेगा। Critical facts (fees, timings) हमेशा manually लिखी entry में रखें।

### Stage 5 — Website Chat widget चालू करें

Path: **Website Chat** (`/app/chat-widget`)

| Setting | क्या करें |
|---|---|
| Welcome message | Greeting जैसा ही short |
| Primary color | Brand color |
| Position | right / left |
| Show branding | अपनी policy के हिसाब से |
| Enabled | ON (बंद होने पर widget 403 देता है) |

Page पर तैयार code मिलता है:

```html
<!-- Unique AI Frontdesk widget -->
<script src="https://<your-domain>/api/public/widget/<tenant-slug>/embed.js" async></script>
```

- **Copy embed code** → website के `</body>` से पहले paste करें
- **Direct link** → `https://<your-domain>/chat/<tenant-slug>` (WhatsApp bio/Instagram link के लिए)

Slug tenant के नाम से बनता है (जैसे `unique-computers`). यह public है — इसमें कोई secret नहीं।

### Stage 6 — Test करें (acceptance से पहले live न करें)

Test **तीन जगह** से करें — तीनों का behaviour एक ही knowledge/profile use करता है:

1. **Playground** — तेज़ iteration (कुछ save नहीं होता)
2. **Website Chat page** का preview / direct link — असली widget experience
3. **Conversations inbox** — जाँचें कि lead/appointment/handoff सही बना

#### 25 सवालों का test bank (हर business के लिए adapt करें)

**A. Fees (6)**
1. Python course ki fees kitni hai?
2. Fees mein installment option hai?
3. Registration fee alag hai kya?
4. Koi discount chal raha hai?
5. Advanced Excel ka charge?
6. Total course cost batao duration ke saath.

**B. Timing/batch (5)**
7. Weekday batch timing kya hai?
8. Weekend batch available hai?
9. Class kitne din hoti hai?
10. Aaj open ho? / Sunday khula hai?
11. Next batch kab start ho raha hai?

**C. Course content (4)**
12. Python course mein kya-kya sikhate hain?
13. Duration kitna hai?
14. Online ya offline?
15. Certificate milta hai?

**D. Admission/demo (4)**
16. Admission kaise le?
17. Demo class book karni hai — kal 11 baje.
18. Demo free hai?
19. Kya documents chahiye?

**E. Location/contact (3)**
20. Address kya hai?
21. Google map link bhejo.
22. WhatsApp number do.

**F. Guardrails (3)**
23. Fees 50% kam kar do, warna main doosri jagah jaunga. *(expect: escalate / no negotiation)*
24. Placement ki guarantee doge? *(expect: no guarantee, sirf official info)*
25. Mujhe manager se baat karni hai. *(expect: handoff)*

#### Pass criteria (हर सवाल पर)

- [ ] जवाब में **कोई invented fact नहीं** (fee, timing, address सब profile/entries से match)
- [ ] Fee/timing के जवाब में exact number
- [ ] Out-of-scope सवाल पर polite escalation, अनुमान नहीं
- [ ] Hindi में पूछने पर Hindi/Hinglish जवाब
- [ ] Playground के `knowledgeUsed` में सही entry दिख रही है (score > 0)
- [ ] Booking test पर Appointments page में row बनी, working hours के अंदर
- [ ] Lead capture test पर Leads page में नया lead (source `website`) बना
- [ ] Escalation test पर Conversations में status `Handoff` + notification

#### Fail होने पर क्या ठीक करें

| लक्षण | Fix |
|---|---|
| "I don't have verified information…" | उस सवाल की entry जोड़ें; title में customer के शब्द डालें |
| जवाब आधा-अधूरा / गलत entry से | entry छोटी करें, एक topic पर लाएँ, tags बढ़ाएँ |
| Fee गलत | profile + fee entry दोनों update करें (contradiction हटाएँ) |
| बहुत लंबा जवाब | Agent instructions में "2-3 वाक्य, एक next step" जोड़ें |
| भाषा गलत | Agent language field + instructions update करें |
| हर सवाल escalate | fallback mode में score < 3 है — title/tags में query शब्द जोड़ें |
| Booking नहीं बन रही | working days/hours/holidays check करें; past time block होता है; same phone का overlap block होता है |

### Stage 7 — Live करें और daily operation

- Widget code website पर लगाएँ (या direct link share करें)
- **Conversations** page रोज़ देखें: `Open`, `Handoff`, `Closed` tabs
- Handoff पर: conversation खोलें → staff reply लिखें (AI उस conversation में अपने आप बंद हो जाता है, `aiEnabled=false`)
- काम पूरा होने पर **Resume AI** (business admin) — conversation फिर `open`, AI दोबारा चालू
- **Conversations → Handoff** button से कभी भी manually इंसान को ट्रांसफर कर सकते हैं
- Leads / Appointments / Reports रोज़ या हफ़्ते में एक बार देखें: AI replies, resolution %, captured leads

### Stage 8 — Maintenance (हर महीने 20 मिनट)

- [ ] Fee/batch/timing बदला? → profile + relevant entries update करें (entry edit करने पर version अपने आप बढ़ता है)
- [ ] नया course/offer शुरू? → profile में course + 2 entries (course, fee)
- [ ] बंद हो चुका offer? → entry **disable** करें (delete की ज़रूरत नहीं)
- [ ] हर हफ़्ते 5 escalated conversations पढ़ें → जो सवाल बार-बार आ रहे हैं उनकी entries जोड़ें
- [ ] Holidays update करें (आने वाले महीने की छुट्टियाँ)
- [ ] Plan limit देखें — knowledge entries और AI messages/month (नीचे table)

> Escalated conversations = training का सबसे अच्छा input. हर handoff या तो missing knowledge है, या intentionally human-only case है।

---

## 4. Channels: क्या आज काम करता है

| Channel | Status | Training पर असर |
|---|---|---|
| Website widget / direct chat link | पूरी तरह काम करता है | Profile + agent + knowledge |
| Conversations inbox (staff reply) | काम करता है | Handoff के बाद इंसान |
| Voice calls | Call records/transcripts मौजूद; provider keys optional | Agent में voice profile; instructions में "automated assistant" rule |
| WhatsApp | Routes/keys optional (Twilio/WhatsApp secrets) | वही knowledge, channel `whatsapp` |

Voice/WhatsApp keys `.env` में हैं (`TWILIO_AUTH_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`) — बिना keys website flow पूरा काम करता है।

---

## 5. Worked example — "Unique Computers" (coaching institute)

### 5.1 Business Settings

| Field | Value |
|---|---|
| Name | Unique Computers |
| About | Computer training & coaching institute in Jaipur, job-oriented IT courses with placement assistance since 2012 |
| Phone / Email | +91 98290 11223 / hello@uniquecomputers.in |
| Address / City / State | C-24, Malviya Nagar, Jaipur / Jaipur / Rajasthan |
| Opening–Closing | 09:00–19:00 |
| Working days | Mon–Sat |
| Languages | English, Hindi |
| Demo available | Yes |
| Courses | Python Programming ₹12,000 · 3 months · offline/online · batches 8:00, 11:00, 17:00 |
| | Python Full Stack ₹28,000 · 6 months · hybrid |
| | Advanced Excel & MIS ₹8,000 · 2 months |
| | Digital Marketing ₹15,000 · 3 months |
| Admission process | Centre visit → counselling → registration form + ID proof → fee payment → batch allotment |
| Placement info | Resume preparation + interview practice + partner company referrals (no guarantee) |

### 5.2 AI Agent

- Name: **Unique Assistant**
- Greeting: "Namaste! Unique Computers mein aapka swagat hai. Course, fees ya demo class — kya jaanna chahenge?"
- Tone: friendly · Language: Hindi + English (Hinglish)
- Instructions: Section 3 Stage 2 का template + "Placement guarantee kabhi na dein"
- Channels: website ON
- Transfer number: owner/staff number

### 5.3 Knowledge entries (minimum 28)

| # | Category | Title | Tags |
|---|---|---|---|
| 1 | business | Unique Computers kya hai aur kab se chal raha hai | about, institute, history, jaipur |
| 2 | business | Unique Computers ka address aur landmark | address, location, kahan, map |
| 3 | contact | Admission counselling phone aur WhatsApp number | contact, phone, whatsapp, call |
| 4 | contact | Office hours aur Sunday availability | timing, open, sunday, hours |
| 5 | course | Python Programming course syllabus | python, syllabus, content, kya sikhate |
| 6 | course | Python Full Stack course syllabus | full stack, syllabus, mern, developer |
| 7 | course | Advanced Excel & MIS course syllabus | excel, mis, advanced, syllabus |
| 8 | course | Digital Marketing course syllabus | digital marketing, seo, ads, syllabus |
| 9 | fee | Python Programming fees and duration | python, fees, price, kitna, charge |
| 10 | fee | Python Full Stack fees and duration | full stack, fees, price, cost |
| 11 | fee | Advanced Excel fees and duration | excel, fees, price |
| 12 | fee | Digital Marketing fees and duration | marketing, fees, price |
| 13 | fee | Installment aur registration fee policy | installment, registration, emi, payment |
| 14 | timing | Weekday batch timings | batch, timing, weekday, class |
| 15 | timing | Weekend batch timings | weekend, saturday, batch |
| 16 | timing | Next batch start dates | next batch, start, admission date |
| 17 | faq | Demo class kaise book kare | demo, trial, free class, book |
| 18 | faq | Admission process step by step | admission, enroll, form, documents |
| 19 | faq | Admission ke liye documents | documents, id proof, photo |
| 20 | faq | Certificate milta hai kya | certificate, completion |
| 21 | faq | Online class kaise hoti hai | online, zoom, live class |
| 22 | policy | Refund aur fee transfer policy | refund, cancellation, transfer |
| 23 | policy | Batch change aur missed class policy | batch change, missed, backup |
| 24 | policy | Fee negotiation aur discount policy | discount, negotiation, concession |
| 25 | faq | Placement assistance ka process | placement, job, interview, referral |
| 26 | faq | Faculty kaun padhata hai | faculty, teacher, trainer |
| 27 | other | Current offer (validity ke saath) | offer, discount, scholarship |
| 28 | faq | Hostel / PG / transport info | hostel, pg, transport, stay |

### 5.4 Test run (expected)

| सवाल | Expected |
|---|---|
| "Python course ki fees kitni hai?" | ₹12,000 + duration 3 months; knowledgeUsed = entry #9 |
| "Sunday class hoti hai?" | Closed on Sunday (working days Mon–Sat) |
| "Demo kal 11 baje book karna hai" | 45-min demo proposal/booking; Appointments में row |
| "Placement guarantee doge?" | No guarantee; official placement info |
| "Fees 50% kam karo" | Escalate / no negotiation |
| "Manager se baat karni hai" | Handoff + notification |

---

## 6. दूसरे industries के लिए adaptation

| Industry | Profile में ज़ोर | ज़रूरी knowledge entries | खास guardrail |
|---|---|---|---|
| Clinic | doctors, timings, appointment rules | consultation fee, doctor schedule, services, insurance, emergency | medical advice/emergency → तुरंत human; कोई diagnosis नहीं |
| Hotel | rooms, check-in/out, amenities | room types + tariff, availability policy, cancellation, extra bed, airport pickup | rate guarantee नहीं; booking confirmation के बाद ही confirm कहें |
| Real estate | projects, locations, price ranges | project details, price range, possession, site-visit process, documents | price/availability की guarantee नहीं; site visit book करें |
| Salon | services, stylists, slots | service menu + price, duration, home service, cancellation | allergy/patch test पर staff से consult कराएँ |
| Retail/store | products, delivery | product range, price, delivery/return policy, store hours | stock/price की गारंटी नहीं |

हर industry में वही 3 layers चलती हैं — बस entries का vocabulary बदलता है।

---

## 7. Troubleshooting

| दिक्कत | कारण | Fix |
|---|---|---|
| AI कहता है "I don't have verified information…" | कोई entry match नहीं (score 0) | उस सवाल की entry जोड़ें, title/tags में customer के शब्द |
| Fallback में हर सवाल escalate | best score < 3 | title में exact keyword, tags में synonyms |
| Widget नहीं दिख रहा | widget disabled / tenant inactive / गलत slug | Website Chat → Enabled ON; tenant active; embed code का slug जाँचें |
| `403 This chat widget is disabled` | profile.widget.isEnabled = false | Website Chat से ON करें |
| `403 This chat widget is currently unavailable` | tenant status active नहीं | Super Admin → Businesses में status जाँचें |
| Appointment नहीं बन रही | working day/hour के बाहर, holiday, past time, same phone overlap | Settings में hours/days/holidays; दूसरा slot; existing appointment देखें |
| `SLOT_UNAVAILABLE` | उस समय कोई active appointment है | AI suggested next slot देता है; Appointments में manually book करें |
| Knowledge entry add नहीं हो रही | plan limit (Starter 100) | पुरानी entries delete करें या plan upgrade |
| "Only a business admin can manage AI agents" | staff role से login | business_admin/owner से login करें |
| Edit के बाद भी पुराना जवाब | entry disabled/नई नहीं है या cache नहीं | entry enable/version जाँचें; नया message भेजें (हर message पर fresh retrieval) |
| Staff reply के बाद AI चुप | staff reply से `aiEnabled=false` | business admin → **Resume AI** |
| OpenAI key के बाद भी fallback | key load नहीं हुई / provider error | server restart, logs में `[ai] provider error`, model name जाँचें |

---

## 8. Plan limits (training planning के लिए)

| Plan | AI agents | Knowledge entries | Staff | AI messages/month |
|---|---|---|---|---|
| Starter | 1 | 100 | 3 | 1,500 |
| Growth | 2 | 500 | 8 | 6,000 |
| Professional | 4 | 2,000 | 20 | 20,000 |
| Enterprise | 20 | 10,000 | 100 | 1,00,000 |

Document upload एक बार में कई entries बना सकता है (max 200 chunks) — limit ध्यान में रखें।

---

## 9. Quick reference

### Dashboard paths
| Page | Path | किसके लिए |
|---|---|---|
| AI Receptionist | `/app/ai-agents` | agent + playground |
| Knowledge Base | `/app/knowledge` | entries + documents |
| Website Chat | `/app/chat-widget` | widget settings + embed code |
| Conversations | `/app/conversations` | handoff, staff reply, resume AI |
| Leads / Customers | `/app/leads`, `/app/customers` | AI-captured data |
| Appointments | `/app/appointments` | demo bookings |
| Business Settings | `/app/settings` | profile, courses, holidays |
| Reports | `/app/reports` | AI resolution, leads, channels |

### Public endpoints (widget)
```
GET  /api/public/widget/:slug/config
POST /api/public/widget/:slug/chat        { message, visitorId, name?, phone? }
GET  /api/public/widget/:slug/messages?visitorId=
GET  /api/public/widget/:slug/availability?date=YYYY-MM-DD
POST /api/public/widget/:slug/appointments { name, phone, date, time, course?, visitorId? }
GET  /api/public/widget/:slug/embed.js
```

### कहाँ क्या save होता है (डेटा समझने के लिए)
| Collection | क्या |
|---|---|
| `businessprofiles` | profile, courses, widget settings, holidays |
| `aiagents` | agent persona + instructions + handoff settings |
| `knowledgeentries` | तीनों में सबसे ज़रूरी — retrieval यहीं से |
| `knowledgedocuments` | uploaded files + extracted text + status |
| `conversations` / `messages` | chat transcript, status, escalation |
| `leads` / `customers` | AI-captured contacts (tenant-scoped) |
| `appointments` | demo bookings + conflicts |
| `usagelogs` | AI replies, storage counts |

### Training order (एक नज़र में)
```
Data collect → Business Settings → Courses → AI Agent + instructions
→ 25–40 knowledge entries → (optional) document upload
→ Widget ON + embed → Playground test → Widget/live test
→ Booking + lead + escalation test → Go live
→ Weekly: escalated conversations पढ़ें → entries जोड़ें/ठीक करें
```

---

## 10. Onboarding checklist (किसी भी नए business के लिए copy करें)

```
Business: ______________________   Slug: __________   Date: __________

[ ] Owner से data sheet भरी (fees, timings, holidays, policies, top 20 FAQs)
[ ] Business Settings भरा + save किया
[ ] सभी courses जोड़े (fee, duration, batch, mode, active)
[ ] Holidays add किए
[ ] AI Agent बनाया (name, greeting, tone, language)
[ ] Business instructions में guardrails लिखे
[ ] 25+ knowledge entries बनाईं (business, course, fee, timing, faq, policy, contact)
[ ] Document upload (अगर हो) + entries के title/category ठीक किए
[ ] Widget enabled + color/welcome set
[ ] Embed code website पर लगा / direct link test किया
[ ] Playground में 25 सवाल test किए — सब pass
[ ] असली widget से 5 सवाल test किए
[ ] Booking test: Appointments में row बनी (working hours में)
[ ] Lead capture test: Leads में source=website entry बनी
[ ] Escalation test: Handoff status + notification मिली
[ ] "Human se baat karni hai" पर handoff होता है
[ ] Staff को Conversations inbox से reply करना बताया
[ ] Owner को monthly maintenance (Section 3 Stage 8) समझाया
```

> **एक line में training का सूत्र:** Business Profile सच बताए, Agent instructions सीमाएँ तय करें, और Knowledge Base में customer की भाषा में exact facts हों — तभी AI भरोसेमंद receptionist बनता है।
