-- Sahara Souq deterministic seed
-- NOTE: This seed file intentionally contains NO flag.
-- The instructor injects the flag into order 582 via scripts/set-flag.mjs
-- (FLAG lives only in the D1 database after setup, never in source).

-- Products (12 real items, SAR prices in halala cents)
INSERT INTO products (id, name_ar, name_en, description_ar, description_en, price_cents, stock, emoji, category) VALUES
(1,  'عود ملكي 100مل', 'Royal Oud Perfume 100ml', 'عطر شرقي فاخر بثبات عالٍ', 'Luxury oriental perfume, long lasting', 34900, 40, '🧴', 'beauty'),
(2,  'تمر سكري فاخر 1كجم', 'Premium Sukkari Dates 1kg', 'تمر سكري من القصيم، فرز أول', 'First-grade Sukkari dates from Qassim', 8900, 200, '🌴', 'grocery'),
(3,  'سماعات لاسلكية', 'Wireless Headphones', 'سماعات بخاصية إلغاء الضوضاء', 'Noise-cancelling wireless headphones', 24900, 60, '🎧', 'electronics'),
(4,  'لابتوب أعمال 14 بوصة', 'Business Laptop 14"', 'لابتوب خفيف للأعمال والدراسة', 'Lightweight laptop for work and study', 289900, 15, '💻', 'electronics'),
(5,  'عباية سوداء كلاسيك', 'Classic Black Abaya', 'عباية بقماش كوري فاخر', 'Premium Korean-fabric abaya', 19900, 80, '🧕', 'fashion'),
(6,  'ثوب رجالي أبيض', 'White Thobe', 'ثوب قطن مريح بخياطة متقنة', 'Comfortable cotton thobe', 15900, 90, '🤵', 'fashion'),
(7,  'قهوة مختصة 500غ', 'Specialty Coffee 500g', 'بن مختص محمص محلياً', 'Locally roasted specialty beans', 6500, 150, '☕', 'grocery'),
(8,  'ساعة ذكية', 'Smart Watch', 'ساعة ذكية بشاشة أموليد', 'Smart watch with AMOLED display', 49900, 35, '⌚', 'electronics'),
(9,  'حذاء رياضي', 'Running Sneakers', 'حذاء خفيف للجري اليومي', 'Lightweight daily running shoes', 32900, 70, '👟', 'fashion'),
(10, 'كيبورد ميكانيكي', 'Mechanical Keyboard', 'كيبورد ميكانيكي بإضاءة RGB', 'Mechanical keyboard with RGB', 27900, 50, '⌨️', 'electronics'),
(11, 'كرسي مكتبي مريح', 'Ergonomic Office Chair', 'كرسي بدعم قطني ومساند', 'Ergonomic chair with lumbar support', 59900, 25, '🪑', 'home'),
(12, 'عسل سدر 500غ', 'Sidr Honey 500g', 'عسل سدر عضوي من الجنوب', 'Organic Sidr honey', 18900, 45, '🍯', 'grocery');

-- Victim user (another customer). Password is a random unusable placeholder;
-- login as this user is not needed for the lab (IDOR only needs enumeration).
INSERT INTO users (id, name, email, password_hash, password_salt, created_at) VALUES
(1, 'ليلى الحربي', 'layla@saharasouq.sa', 'seeded-unusable-hash', 'seeded-unusable-salt', '2025-11-02 10:00:00');

-- Order 581 (victim, delivered) — must exist for 581 -> 582 enumeration demo
INSERT INTO orders (id, user_id, status, total_cents, shipping_name, shipping_phone, shipping_city, shipping_address, notes, created_at) VALUES
(581, 1, 'delivered', 24300, 'ليلى الحربي', '0551237846', 'الرياض', 'حي النرجس، شارع الأمير محمد، مبنى 12', 'التوصيل بعد الساعة 5 مساءً', '2026-01-18 14:22:10');

INSERT INTO order_items (order_id, product_id, qty, unit_price_cents) VALUES
(581, 2, 2, 8900),
(581, 7, 1, 6500);

-- Order 582 (victim, TARGET). Notes field is a placeholder here;
-- scripts/set-flag.mjs replaces it with the real warranty code containing the flag.
INSERT INTO orders (id, user_id, status, total_cents, shipping_name, shipping_phone, shipping_city, shipping_address, notes, created_at) VALUES
(582, 1, 'shipped', 53800, 'ليلى الحربي', '0551237846', 'جدة', 'حي الروضة، شارع الكيال، برج 7، شقة 302', 'تغليف هدية + بطاقة إهداء: عيد ميلاد سعيد!', '2026-02-04 09:41:55');

INSERT INTO order_items (order_id, product_id, qty, unit_price_cents) VALUES
(582, 1, 1, 34900),
(582, 12, 1, 18900);

-- Ensure next user-created order gets id 583+
UPDATE sqlite_sequence SET seq = 582 WHERE name = 'orders';
UPDATE sqlite_sequence SET seq = 12 WHERE name = 'products';
UPDATE sqlite_sequence SET seq = 1 WHERE name = 'users';
