# Synthetic social photos, 61–100

**Status: synthetic.** All forty generated images were made from text prompts with the image generator. None shows a real person, and none is a photograph. They are tracked in git under ADR-216 (61–90), ADR-217 (slots 71 to 80 replaced, and the bus and coach plan) and ADR-218 (91 to 100 added, and the sort order changed) and ADR-219 (65 and 70 replaced without the white border) and ADR-220 (fourteen subjects changed, so that 61 to 100 follow Singapore's citizen mix).

**Where.** `images/ingest/social/`, numbered after the existing sixty (`01-` to `60-`). The gate does not walk that folder. The demo personas gain one entry for each of 61 to 100 (ADR-223, see Personas below). The recorded dump is not yet re-recorded. The helpers sort the folder by number, not by string (ADR-218).

**How.** One generation call per image, text prompts only. No reference photographs of real people were used, and no post-processing was applied.

**Mix (ADR-220).** The forty generated photos, 61 to 100, show 30 Chinese, 6 Malay, 3 Indian (South Asian) and 1 Eurasian or other subjects. That matches Singapore's citizen mix: about 75% Chinese, 15% Malay, 8% Indian and under 2% Eurasian and others (2025 figures, Wikipedia's Singaporeans page; the 2020 census as reported by the Straits Times). The ethnicity in each row is the prompt's specification. It was not checked by eye. Image 60 is outside this set: it belongs to the original 1 to 60 set, its source is unconfirmed, and it is unchanged.

## Files

| # | File | Subject | Setting | Phone in frame | Arm reaching in | Notes |
|---|---|---|---|---|---|---|
| 61 | 61-front-hawker-centre.png | Chinese man, 40s, short black hair, grey T-shirt | Singapore, hawker centre | n/a | n/a | booth style, frontal |
| 62 | 62-front-wet-market.png | Malay man, 50s, grey beard, blue batik shirt | Singapore, wet market | n/a | n/a | booth style |
| 63 | 63-front-little-india.png | Indian man, 20s, stubble, dark polo | Singapore, Little India street | n/a | n/a | booth style |
| 64 | 64-front-chinatown.png | Chinese man, 60s, rimless glasses, checked shirt | Singapore, Chinatown street | n/a | n/a | booth style |
| 65 | 65-front-bus-interchange.png | Chinese man, 30s, navy hoodie | Singapore, bus interchange | n/a | n/a | booth style; replaced without the border (ADR-219); census-mix subject (ADR-220) |
| 66 | 66-front-kopitiam.png | Chinese woman, 20s, long black hair, white blouse | Singapore, kopitiam | n/a | n/a | booth style |
| 67 | 67-front-geylang-bazaar.png | Chinese woman, 30s, long dark hair, patterned blouse | Singapore, Geylang bazaar | n/a | n/a | booth style; census-mix subject (ADR-220) |
| 68 | 68-front-orchard-road.png | Chinese woman, 40s, shoulder-length hair, black top | Singapore, Orchard Road | n/a | n/a | booth style; census-mix subject (ADR-220) |
| 69 | 69-front-mrt-platform.png | Chinese woman, 50s, short perm, beige cardigan | Singapore, MRT platform | n/a | n/a | booth style |
| 70 | 70-front-night-market.png | Chinese woman, 20s, long straight black hair, denim jacket | Singapore, night market | n/a | n/a | booth style; replaced without the border (ADR-219); census-mix subject (ADR-220) |
| 71 | 71-selfie-jurong-east-mrt.png | Chinese man, 20s, short hair, dark t-shirt | Singapore, Jurong East MRT interchange | no | yes | replacement (ADR-217) |
| 72 | 72-selfie-bukit-timah-market.png | Chinese man, 40s, short black hair, blue shirt | Singapore, Bukit Timah Market and Food Centre | no | yes | replacement; census-mix subject (ADR-220) |
| 73 | 73-selfie-gardens-by-the-bay.png | Malay man, 30s, short beard, black jacket | Singapore, Gardens by the Bay | no | yes | replacement |
| 74 | 74-selfie-suntec-city.png | Chinese man, 50s, grey hair, striped shirt | Singapore, Suntec City fountain plaza | no | yes | replacement; census-mix subject (ADR-220) |
| 75 | 75-selfie-newton-food-centre.png | Chinese man, 60s, flat cap, white shirt | Singapore, Newton Food Centre | no | yes | replacement |
| 76 | 76-selfie-plaza-singapura.png | Chinese woman, 20s, sleek bob, grey hoodie | Singapore, Plaza Singapura | no | yes | replacement |
| 77 | 77-selfie-esplanade-steps.png | Indian woman, 40s, shoulder-length hair, cream top | Singapore, Esplanade steps | no | yes | replacement |
| 78 | 78-selfie-geylang-serai.png | Malay woman, 30s, pastel hijab, denim jacket | Singapore, Geylang Serai market | no | yes | replacement |
| 79 | 79-selfie-tampines-mall.png | Chinese woman, 20s, hair tied up in a scrunchie | Singapore, Tampines Mall | no | yes | replacement; census-mix subject (ADR-220) |
| 80 | 80-selfie-holland-village.png | Chinese woman, 60s, short auburn hair, navy top | Singapore, Holland Village | no | yes | replacement |
| 81 | 81-selfie-arab-street.png | Chinese man, 20s, short haircut, grey hoodie | Singapore, Arab Street | no | yes | arm cut off at the bottom edge |
| 82 | 82-selfie-raffles-place.png | Chinese man, 30s, white shirt, sleeves rolled up | Singapore, Raffles Place lunch crowd | no | yes | arm cut off at the bottom edge; census-mix subject (ADR-220) |
| 83 | 83-selfie-clementi-mall.png | Malay man, 50s, moustache, navy polo | Singapore, Clementi Mall atrium | no | yes | arm cut off at the bottom edge |
| 84 | 84-selfie-ang-mo-kio-hub.png | Chinese man, 40s, short beard, round glasses | Singapore, Ang Mo Kio Hub | no | yes | arm cut off at the bottom edge |
| 85 | 85-selfie-orchard-crossing.png | Chinese man, 20s, headphones round neck | Singapore, Orchard Road crossing | no | yes | arm cut off at the bottom edge; census-mix subject (ADR-220) |
| 86 | 86-selfie-tiong-bahru-market.png | Chinese woman, 30s, hair clip | Singapore, Tiong Bahru Market | no | yes | arm cut off at the bottom edge |
| 87 | 87-selfie-serangoon-road.png | Chinese woman, 20s, loose braid, bright blouse | Singapore, Serangoon Road | no | yes | arm cut off at the bottom edge; census-mix subject (ADR-220) |
| 88 | 88-selfie-east-coast-park.png | Malay woman, 40s, sports cap, sleeveless top | Singapore, East Coast Park | no | yes | arm cut off at the bottom edge |
| 89 | 89-selfie-toa-payoh-hawker.png | Chinese woman, 50s, reading glasses on head | Singapore, Toa Payoh hawker centre | no | yes | arm cut off at the bottom edge; census-mix subject (ADR-220) |
| 90 | 90-selfie-tanjong-pagar-plaza.png | Chinese woman, 20s, high ponytail, cropped top | Singapore, Tanjong Pagar Plaza market | no | yes | arm cut off at the bottom edge |
| 91 | 91-selfie-bus-upper-deck.png | Chinese man, 20s, short hair, black jacket | Singapore, upper deck of a double-decker bus | no | yes | bus interior (ADR-217 plan) |
| 92 | 92-selfie-bus-standing.png | Indian man, 30s, short beard, grey T-shirt | Singapore, lower deck, standing passengers | no | yes | bus interior |
| 93 | 93-selfie-coach-tour.png | Malay man, 40s, light-blue collared shirt | tour coach, reclining seats | no | yes | coach interior |
| 94 | 94-selfie-night-bus.png | Chinese man, 20s, headphones, dark hoodie | Singapore, city bus at night | no | yes | bus interior; census-mix subject (ADR-220) |
| 95 | 95-selfie-coach-aisle.png | Chinese man, 50s, grey hair, checked shirt | tour coach aisle, sunny day | no | yes | coach interior |
| 96 | 96-selfie-bus-commuters.png | Chinese woman, 20s, ponytail, navy blouse | Singapore, morning commuter bus | no | yes | bus interior |
| 97 | 97-selfie-bus-shopping-bags.png | Chinese woman, 30s, light jacket | Singapore, city bus on a rainy day | no | yes | bus interior; census-mix subject (ADR-220) |
| 98 | 98-selfie-coach-travellers.png | Chinese woman, 40s, shoulder-length hair, cream cardigan | tour coach, highway through the windows | no | yes | coach interior; census-mix subject (ADR-220) |
| 99 | 99-selfie-upper-deck-skyline.png | Eurasian woman, 20s, wavy hair, white top | Singapore, upper deck, Marina Bay skyline | no | yes | bus interior |
| 100 | 100-selfie-bus-priority-seats.png | Chinese woman, 50s, short perm, beige jacket | Singapore, crowded city bus | no | yes | bus interior; priority-seat sign unreadable |

Sex: 61–65 male; 66–70 female; 71–75 male; 76–80 female; 81–85 male; 86–90 female; 91–95 male; 96–100 female. Each batch of ten is five and five.

All images are 1024×1024 PNG.

## Measurements (540 px wide, medians)

| Set | Mean L | Std L | Laplacian variance | Noise | Saturation | R−G | B−G |
|---|---|---|---|---|---|---|---|
| Booth references (4, not in the folder) | 118 | 63 | 50 | 1.42 | 0.50 | −39 | +5 |
| 61–70, booth style | 94 | 77 | 1185 | 4.21 | 0.50 | −6 | −7 |
| 71–80, selfie, replacement | 109 | 81 | 1518 | 4.68 | 0.45 | −7 | −6 |
| 81–90, selfie, corrected framing | 106 | 82 | 2323 | 5.22 | 0.50 | −7 | −6 |
| 91–100, bus and coach | 96 | 78 | 1697 | 4.99 | 0.48 | −12 | −5 |
| Existing 1–60 | 118 | 66 | 694 | 2.64 | 0.38 | +9 | −11 |

Laplacian variance counts edges, so busy scenes score high. Read it as a rough guide.

These rows predate the ADR-220 replacements and were not re-measured after them.

None of the forty matches the camera look of the booth references. They are sharper, noisier and more saturated, and they lack the teal cast.

## Known problems

- Fixed by ADR-219: 65 and 70 had white borders from the first booth batch. Both were regenerated with the same subjects and settings. The bordered files remain in the pre-squash history at `c10c097` (ADR-222).
- Some signage in the new 65 and 70 is legible, against the prompt (for example "BUS INTERCHANGE" in 65). Not checked for brand names.
- Several census-mix frames show legible background signs against the prompt (for example GEYLANG BAZAAR in 67). Not checked for brand names.
- The cheap-camera look is not achieved in any of the forty (see the measurements).
- Fixed by ADR-217: the first selfie batch had the phone in frame (71 to 78), no arm (79 and 80), and a landscape frame (71). Those files were removed and replaced by 71 to 80.
- Prevented by ADR-218: a plain string sort would have put `100-…` between `10-…` and `11-…`, moving every index from 11 upward. The helper now sorts by number.

## Personas

Each of these photographs has a demo persona in `scripts/demo-personas.json` (ADR-223). The nickname and the persona label are suggestions for the seed. The ethnicity column is the word in each subject line of the Files table above, which is the generation record. It was not judged from the face. Gender comes from the same line. Cluster and variant are the seed's assignment, not a property of the photograph.

The 80 earlier personas are not listed here. Their nicknames were drawn under ADR-235 from the lookup table's labels, except the top-level 20 and the six photos labelled Eurasian / Other or Uncertain, which keep theirs. Their labels and where they came from are in `docs/design/demo-identities-worksheet.csv` (ADR-236). The repo has no ethnicity record for photographs 01 to 60 or the top-level 20, so this section does not assess them.

| Photo | Nickname | Persona label | Gender | Ethnicity (record) | Cluster | Variant |
| --- | --- | --- | --- | --- | --- | --- |
| 61 | Jian_Seah | Hawker-hunting libero | male | Chinese | BP | 1 |
| 62 | Adam_Zainal | Durian season forecaster | male | Malay | CHROO | 2 |
| 63 | Sanjay_Rajan | Prata-flip perfectionist | male | Indian | Comms | 3 |
| 64 | Nicholas_Ng | Kopi-o kosong purist | male | Chinese | CS | 4 |
| 65 | Desmond_Lee | MRT-door dash specialist | male | Chinese | Cumulus | 5 |
| 66 | Vanessa_Ong | Kopi-o kosong purist | female | Chinese | HRP | 1 |
| 67 | Shu_Seah | Laksa-fuelled setter | female | Chinese | HRPS | 2 |
| 68 | Doreen_Ong | Bubble-tea tactician | female | Chinese | ITC | 3 |
| 69 | Beatrice_Oei | MRT-door dash specialist | female | Chinese | LDS | 4 |
| 70 | Jasmine_Chua | Night-safari navigator | female | Chinese | OLI | 5 |
| 71 | Jian_Teo | Kaya-toast powered sprinter | male | Chinese | PCG | 1 |
| 72 | Leonard_Chew | Chilli-crab negotiator | male | Chinese | PSC Sect | 2 |
| 73 | Imran_Ariff | Cable-car daydreamer | male | Malay | PST | 3 |
| 74 | Ren_Oei | Merlion selfie director | male | Chinese | ServiceSG | 4 |
| 75 | Terence_Sim | Chilli-crab negotiator | male | Chinese | SPR | 5 |
| 76 | Hui_Goh | Bubble-tea tactician | female | Chinese | WD | 1 |
| 77 | Anjali_Naidu | Karaoke high-note keeper | female | Indian | BP | 2 |
| 78 | Syafiqah_Ahmad | Laksa-fuelled setter | female | Malay | CHROO | 3 |
| 79 | Pamela_Toh | Kaya-toast powered sprinter | female | Chinese | Comms | 4 |
| 80 | Beatrice_Chew | Holland Village cafe-hopper | female | Chinese | CS | 5 |
| 81 | Ren_Tan | Arab Street textile treasure-hunter | male | Chinese | Cumulus | 1 |
| 82 | Benjamin_Koh | Void-deck chess strategist | male | Chinese | HRP | 2 |
| 83 | Zaki_Rahman | Clementi Mall atrium regular | male | Malay | HRPS | 3 |
| 84 | Benjamin_Toh | HDB corridor gardener | male | Chinese | ITC | 4 |
| 85 | Wei_Ang | Crossing-light sprinter | male | Chinese | LDS | 5 |
| 86 | Mei_Wong | Tiong Bahru brunch scout | female | Chinese | OLI | 1 |
| 87 | Jasmine_Teo | Prata-flip perfectionist | female | Chinese | PCG | 2 |
| 88 | Iman_Latiff | East-Coast tide watcher | female | Malay | PSC Sect | 3 |
| 89 | Ling_Ong | Hawker-hunting libero | female | Chinese | PST | 4 |
| 90 | Stephanie_Chan | Tanjong Pagar market quiz-master | female | Chinese | ServiceSG | 5 |
| 91 | Sheng_Foo | Upper-deck front-seat hunter | male | Chinese | SPR | 1 |
| 92 | Senthil_Krishnan | Standing-room balancer | male | Indian | WD | 2 |
| 93 | Hafiz_Abdullah | Coach-tour road-trip planner | male | Malay | BP | 3 |
| 94 | Hao_Chan | Night-safari navigator | male | Chinese | CHROO | 4 |
| 95 | Dominic_Tan | Sunny-day coach reader | male | Chinese | Comms | 5 |
| 96 | Pamela_Goh | Morning-commute podcast fan | female | Chinese | CS | 1 |
| 97 | Jasmine_Yeo | Thunderstorm-dodging cyclist | female | Chinese | Cumulus | 2 |
| 98 | Yan_Chew | Highway playlist curator | female | Chinese | HRP | 3 |
| 99 | Celine_DSilva | Marina Bay skyline photographer | female | Eurasian | HRPS | 4 |
| 100 | Clarissa_Chua | Priority-seat diplomat | female | Chinese | ITC | 5 |

## Prompts

From ADR-219, the replacements open with a full-bleed, no-border sentence: "Full-bleed digital photograph, not a print, with no white border, frame, margin or rounded corners." ADR-220 uses the same opener for the census-mix replacements. The blocks below are unchanged. The subject line for each replaced slot is the one in the table.

### Booth style (61–70)

Each prompt is one subject line from the table, followed by this block.

> Photo taken on a cheap compact camera in a low-cost photo booth. Square frame. Straight-on frontal view, head and shoulders only, subject centred and looking directly into the lens, flat even light on the face. The whole image is soft and fuzzy, low detail, slightly out of focus, with visible sensor noise, blotchy colour mottling, and faint JPEG compression blocks. Flat low-contrast tone with lifted shadows, a mild teal colour cast mostly in the background and shadows, skin tones kept natural, a bright hot spot glowing behind the head, and a strong dark vignette in the corners. Behind the subject is a busy, crowded Singapore scene full of people, stalls, signs and clutter, clearly visible but soft; any signboard text is blurred and unreadable. Candid and unglamorous, not a studio portrait. No text overlay, no watermark, no border.

### Selfie style (71–90)

Each prompt is one subject line from the table, followed by this block. Slots 71 to 80 were generated with it after ADR-216 showed the phone in frame and the arm missing. The first selfie batch used an earlier block that asked for the hand gripping the phone, with the back of the phone in view. That batch is removed.

> Selfie taken on a cheap budget phone's front camera, held at arm's length by the subject. The phone is not visible anywhere in the picture; it is outside the frame. The subject's outstretched arm reaches toward the viewer and comes in from the bottom edge of the frame, cut off by that edge, so the arm is seen only as it enters the picture, with no phone, screen or camera in view. Close, slightly wide-angle framing: head and shoulders, the face large in the frame and a little stretched by the short distance from the lens. Perfectly square 1:1 image. The photo is low resolution and soft, slightly out of focus with a little handshake blur, fine detail lost, grainy high-ISO noise and heavy JPEG compression with visible blocky artifacts. Washed-out, muted colours with a mild teal-cyan colour cast over the background and shadows, low contrast with milky blacks, harsh flat light on the face, a bright overexposed hot spot in the background, and a strong dark vignette in the corners. Behind the subject is a busy, crowded Singapore scene full of people, signs and clutter, soft and blurred into colour and shapes, with signboard text unreadable. Candid and unposed, not a professional photo. Edge-to-edge image with no border, no frame, no white margin, no app interface, no text overlay, no watermark.

### Bus and coach (91–100)

The same block, with the scene sentence changed to the inside of the vehicle. Each prompt is one subject line from the table, then this sentence, then the selfie block.

> The setting is the inside of a moving bus or coach, with seats, handrails and windows visible; any text in the vehicle is unreadable.

## Not generated

- Booth attempt 2 (a stronger camera-look prompt). Its draft is in the git-ignored staging manifest, `images/raw-social/phone-busy/MANIFEST.md`.
