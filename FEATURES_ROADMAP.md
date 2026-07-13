# True Match — Feature Implementation Roadmap

## 1. Likes Section Access Control (Gender-Based Freemium)

### Overview
- **Girls (female)**: Can view first 10 profiles in "Who Liked You" on freemium
- **Guys (male)**: All profiles locked unless premium

### Backend Changes

#### Database Schema Updates
Update `backend/prisma/schema.prisma`:
- Add field to track how many profiles a user has viewed in likes section
- Add `likeProfilesViewedCount` to `User` model (tracked per session/day)

#### API Changes (`backend/src/routes/likes.ts`)

```typescript
/**
 * GET /api/likes
 * Apply gender-based restrictions:
 * - Female users: return first 10 profiles on freemium, all on premium
 * - Male users: return profiles only if premium is active, empty array otherwise
 */
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const user = req.authUser!;
  const isPremium = isPremiumActive(user.premiumUntil);
  
  // Gender-based restrictions
  if (user.profile?.gender === "male" && !isPremium) {
    // Males see nothing unless premium
    return res.json({ likes: [], newCount: 0, locked: true });
  }
  
  // Fetch all likes (unchanged)
  const likes = [...]; // existing logic
  
  // Female freemium limit: first 10 profiles
  if (user.profile?.gender === "female" && !isPremium) {
    const limitedLikes = likes.slice(0, 10);
    return res.json({ 
      likes: limitedLikes, 
      newCount: newCount,
      locked: false,
      total: likes.length, // Show total count even if limited
      remaining: Math.max(0, likes.length - 10)
    });
  }
  
  // Premium users see all
  res.json({ likes, newCount, locked: false });
});
```

### Frontend Changes (`frontend/src/screens/Likes.tsx`)
- Add premium lock indicator for male users (show CTA to upgrade)
- For female users: show "View first 10" on freemium with "See all X profiles" upgrade prompt
- Badge shows count correctly even when limited

---

## 2. Admin Panel: User Management (Replace Seed with One-User-at-a-Time)

### Overview
- Remove "Load samples" and "Remove samples" buttons entirely
- Add UI form to add single user with custom data:
  - Name, Gender, Age (birthdate), Intent, City
  - Upload photos (multiple)
  - Optional fields: Bio, Height, Smoking, Drinking, Interests, Work/Education

### Backend Changes

#### New Endpoint: `POST /api/admin/users/create`

```typescript
const createUserSchema = z.object({
  name: z.string().trim().min(1).max(50),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: z.nativeEnum(Gender),
  intent: z.nativeEnum(Intent),
  city: z.nativeEnum(City),
  bio: z.string().trim().max(500).optional(),
  heightCm: z.coerce.number().int().min(100).max(250).optional(),
  smoking: z.nativeEnum(Habit).optional(),
  drinking: z.nativeEnum(Habit).optional(),
  interests: z.array(z.string()).optional(),
  education: z.string().trim().max(100).optional(),
  work: z.string().trim().max(100).optional(),
  // Photo URLs (must be pre-uploaded to R2)
  photoUrls: z.array(z.string().url()).min(1).max(6),
  // Auto-approve or set to pending
  autoApprove: z.boolean().default(false),
});

router.post(
  "/users/create",
  validateBody(createUserSchema),
  async (req: Request, res: Response) => {
    const data = req.body as z.infer<typeof createUserSchema>;
    
    // Generate a fake Telegram ID for admin-created users
    // Use a reserved range like 999_000_000_000 + sequential
    const fakeTelegramId = 999_000_000_000n + BigInt(Date.now());
    
    const user = await prisma.user.create({
      data: {
        telegramId: fakeTelegramId,
        language: "uz", // default
        profile: {
          create: {
            name: data.name,
            birthdate: new Date(data.birthdate),
            gender: data.gender,
            intent: data.intent,
            city: data.city,
            status: data.autoApprove ? "approved" : "pending",
            bio: data.bio,
            heightCm: data.heightCm,
            smoking: data.smoking,
            drinking: data.drinking,
            interests: data.interests || [],
            education: data.education,
            work: data.work,
            // Create photos in order
            photos: {
              createMany: {
                data: data.photoUrls.map((url, idx) => ({
                  url,
                  key: url.split("/").pop() || `admin-${idx}`,
                  position: idx,
                })),
              },
            },
          },
        },
      },
      include: { profile: { include: { photos: true } } },
    });
    
    res.json({ ok: true, userId: user.id, telegramId: user.telegramId.toString() });
  }
);
```

#### Remove Seed Endpoints
Delete or deprecate:
- `POST /api/admin/seed`
- `POST /api/admin/seed/remove`

### Frontend Admin Panel Changes

Replace the "Load/Remove Samples" section with:

**New Form Component**: `AdminAddUserForm.tsx`
- Text inputs: Name, Bio, Education, Work
- Date input: Birthdate
- Dropdowns: Gender, Intent, City, Smoking, Drinking
- Array input: Interests (tags)
- Number: Height
- Photo uploader (drag-drop, multi-select)
  - Pre-upload to R2, get URLs
  - Reorder photos
- Checkbox: "Auto-approve profile"
- Submit button

---

## 3. Broadcast Page: Media + Single User + Scheduled

### Overview
**Three new features** on the broadcast page:

1. **Attach media** (photo/video) to text messages
2. **Send to single user** (select from dropdown/list)
3. **Schedule messages** (auto-broadcast at specific hour daily)

### Database Changes

Add to `backend/prisma/schema.prisma`:

```prisma
model Broadcast {
  id           String   @id @default(cuid())
  messageText  String
  mediaUrl     String?  // photo/video URL in R2
  // null = send to all; otherwise a specific userId
  targetUserId String?
  target       User?    @relation(fields: [targetUserId], references: [id], onDelete: SetNull)
  
  // Scheduling: if cronHour is set, auto-send daily at that UTC hour
  cronHour     Int?     // 0-23, null = one-time only
  
  // Track delivery
  sentCount    Int      @default(0)
  lastSentAt   DateTime?
  
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  
  @@index([cronHour])
}
```

Run migration:
```bash
npx prisma migrate dev --name add_broadcast_scheduling
```

### Backend Changes

#### New Broadcast Routes (`backend/src/broadcast/broadcast.ts` or extend `backend/src/routes/broadcast.ts`)

```typescript
const broadcastSchema = z.object({
  messageText: z.string().trim().min(1).max(4000),
  mediaUrl: z.string().url().optional(), // R2 URL
  targetUserId: z.string().optional(), // null = send to all
  cronHour: z.coerce.number().int().min(0).max(23).optional(), // null = one-time
  sendNow: z.boolean().default(false), // send immediately?
});

/**
 * POST /api/admin/broadcast — create or schedule a broadcast
 */
router.post(
  "/",
  validateBody(broadcastSchema),
  async (req: Request, res: Response) => {
    const data = req.body as z.infer<typeof broadcastSchema>;
    
    const broadcast = await prisma.broadcast.create({
      data: {
        messageText: data.messageText,
        mediaUrl: data.mediaUrl || null,
        targetUserId: data.targetUserId || null,
        cronHour: data.cronHour || null,
      },
    });
    
    // If sendNow or no cronHour, execute immediately
    if (data.sendNow || !data.cronHour) {
      await broadcastNow(broadcast.id);
    }
    
    res.json({ ok: true, id: broadcast.id });
  }
);

/**
 * Internal function to send broadcast
 */
async function broadcastNow(broadcastId: string) {
  const b = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
    include: { target: true },
  });
  
  if (!b) return;
  
  // Determine target users
  let userIds: string[] = [];
  if (b.targetUserId) {
    userIds = [b.targetUserId];
  } else {
    // Send to all approved, non-banned users
    const users = await prisma.user.findMany({
      where: {
        isBanned: false,
        profile: { status: "approved" },
      },
      select: { id: true },
    });
    userIds = users.map(u => u.id);
  }
  
  // Send via Telegram bot
  for (const userId of userIds) {
    await sendBroadcastToUser(userId, b.messageText, b.mediaUrl);
  }
  
  // Update sent count & timestamp
  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: {
      sentCount: userIds.length,
      lastSentAt: new Date(),
    },
  });
}

/**
 * Helper: send via bot to a single user
 */
async function sendBroadcastToUser(userId: string, text: string, mediaUrl?: string | null) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  
  if (mediaUrl) {
    // Send photo
    await bot.api.sendPhoto(user.telegramId, mediaUrl, { caption: text });
  } else {
    // Send text
    await bot.api.sendMessage(user.telegramId, text);
  }
}

/**
 * Cron job (run every hour, or use a worker)
 * Call this via a scheduled job (e.g., GitHub Actions, EasyCron, or a worker)
 */
export async function processDueScheduledBroadcasts() {
  const now = new Date();
  const currentHour = now.getUTCHours();
  
  const due = await prisma.broadcast.findMany({
    where: {
      cronHour: currentHour,
      // Optional: only if not sent today
      OR: [
        { lastSentAt: null },
        { lastSentAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
      ],
    },
  });
  
  for (const b of due) {
    await broadcastNow(b.id);
  }
}
```

#### Integrate Cron into `backend/src/index.ts`

```typescript
// Example: check every hour
setInterval(async () => {
  try {
    await processDueScheduledBroadcasts();
  } catch (err) {
    console.error("[broadcast cron]", err);
  }
}, 60 * 60 * 1000); // every hour
```

### Frontend Broadcast Admin Page Changes

**New UI Layout**:

```
┌─────────────────────────────────────────┐
│ Broadcast Message                       │
├─────────────────────────────────────────┤
│ Message Text:  [textarea]               │
├─────────────────────────────────────────┤
│ Attach Media (optional):                │
│  [Upload photo/video]                   │
│  Preview: [image if uploaded]           │
├─────────────────────────────────────────┤
│ Send to:                                │
│  ⦿ All approved users                  │
│  ○ Single user:                         │
│    [Dropdown: Search user by name...]   │
├─────────────────────────────────────────┤
│ Schedule:                               │
│  ☐ One-time send now                    │
│  ☐ Daily at: [Hour selector 0-23] UTC  │
├─────────────────────────────────────────┤
│ [ Cancel ]  [ Send ]                    │
└─────────────────────────────────────────┘

Sent Broadcasts (History):
┌─────────────────────────────────────────┐
│ Text | Media | Target | Last Sent | ... │
├─────────────────────────────────────────┤
│ ... | ✓      | All    | 2h ago    | ... │
└─────────────────────────────────────────┘
```

---

## 4. Premium Pricing: Multiple Tiers (Up to 4)

### Overview
Currently: 1 tier (30 days)
New: Up to 4 tiers with custom periods (e.g., 7 days, 30 days, 90 days, 365 days)

### Database Changes

Update `backend/prisma/schema.prisma`:

```prisma
model Settings {
  // ... existing fields ...
  
  // Premium pricing tiers (JSON array or separate model)
  // For simplicity, store up to 4 tiers as JSON
  premiumTiers String? // JSON: [{ days: 7, priceStars: 99 }, ...]
  
  // For card payments, same approach
  premiumTiersUzs String? // JSON: [{ days: 7, priceUzs: 50000 }, ...]
}
```

Or create a separate model for flexibility:

```prisma
model PremiumTier {
  id       String  @id @default(cuid())
  days     Int     // 7, 30, 90, 365, etc.
  priceStars Int?  // Telegram Stars price
  priceUzs   Int?  // Card payment price
  order    Int     // Display order (1, 2, 3, 4)
  
  @@unique([days])
}
```

### Backend Changes

#### Update Admin Settings Endpoints

```typescript
const premiumTierSchema = z.object({
  days: z.coerce.number().int().min(1).max(3650),
  priceStars: z.coerce.number().int().min(1).optional(),
  priceUzs: z.coerce.number().int().min(1).optional(),
});

const updatedSettingsSchema = z.object({
  // ... existing fields ...
  premiumTiers: z.array(premiumTierSchema).min(1).max(4),
});

/**
 * POST /api/admin/settings — now includes premium tier configuration
 */
router.post(
  "/settings",
  validateBody(updatedSettingsSchema),
  async (req: Request, res: Response) => {
    // Validate & upsert tiers
    const tiers = req.body.premiumTiers;
    
    // Ensure no duplicates
    const daySet = new Set(tiers.map(t => t.days));
    if (daySet.size !== tiers.length) {
      return res.status(400).json({ error: "duplicate_tier_days" });
    }
    
    // Create/update tiers
    await prisma.$transaction(
      tiers.map((tier, idx) =>
        prisma.premiumTier.upsert({
          where: { days: tier.days },
          create: { days: tier.days, priceStars: tier.priceStars, priceUzs: tier.priceUzs, order: idx + 1 },
          update: { priceStars: tier.priceStars, priceUzs: tier.priceUzs, order: idx + 1 },
        })
      )
    );
    
    res.json({ ok: true, tiers });
  }
);

/**
 * GET /api/premium/tiers — public endpoint (frontend calls this)
 */
router.get("/tiers", async (_req: Request, res: Response) => {
  const tiers = await prisma.premiumTier.findMany({
    orderBy: { order: "asc" },
  });
  res.json({ tiers });
});
```

#### Update Premium Purchase Routes

When a user clicks "Get Premium", show all 4 tiers:

```typescript
// frontend calls /api/premium/tiers to fetch & display options
// user selects one
// frontend calls POST /api/premium/buy { tierDays: 30 }
router.post(
  "/buy",
  validateBody(z.object({ tierDays: z.coerce.number().int() })),
  async (req: Request, res: Response) => {
    const { tierDays } = req.body;
    const tier = await prisma.premiumTier.findUnique({ where: { days: tierDays } });
    if (!tier || !tier.priceStars) {
      return res.status(404).json({ error: "tier_not_found" });
    }
    
    // Create Telegram Stars payment...
    // (existing logic, unchanged)
  }
);
```

### Frontend Changes

#### Premium Purchase UI

Replace single "Buy Premium 30 days" with a **tier selector**:

```tsx
// frontend/src/components/PremiumTierSelector.tsx
const [tiers, setTiers] = useState([]);

useEffect(() => {
  const data = await api.get("/premium/tiers");
  setTiers(data.tiers); // [{ days: 7, priceStars: 99 }, ...]
}, []);

return (
  <div className="grid grid-cols-2 gap-2">
    {tiers.map(tier => (
      <button
        key={tier.days}
        onClick={() => buyPremium(tier.days)}
        className="p-4 border rounded hover:bg-blue-100"
      >
        <div className="font-bold">{tier.days} days</div>
        <div className="text-lg">{tier.priceStars}⭐</div>
      </button>
    ))}
  </div>
);
```

#### Admin Panel: Configure Tiers

Add a "Premium Pricing" section in admin settings:

```
┌──────────────────────────────────────────┐
│ Premium Pricing Tiers (up to 4)         │
├──────────────────────────────────────────┤
│ Tier 1: [7   ] days  [99   ]⭐  [50000] UZS
│ Tier 2: [30  ] days  [299  ]⭐  [150000] UZS
│ Tier 3: [90  ] days  [799  ]⭐  [400000] UZS
│ Tier 4: [365 ] days  [2999 ]⭐  [1500000] UZS
├──────────────────────────────────────────┤
│ [ Add Tier ]  [ Save ]                    │
└──────────────────────────────────────────┘
```

---

## 5. CardXabar Userbot Integration (`userbot.py`)

### Overview
The userbot is already built (as you provided). It:
1. Listens for CardXabar payment notifications in Telegram
2. Extracts the payment amount
3. Calls the backend webhook to activate the premium

### Integration Points

**Already handled** in your repo:
- ✅ `backend/src/routes/payments.ts` has the CardXabar webhook handler
- ✅ Payment order lifecycle (pending → paid → expired)
- ✅ Unique tiyin suffix matching system

**What needs to connect**:
1. Update `premiumTiers` to use the new tier system
2. The webhook should apply the correct tier based on matched tier
3. Userbot config references the webhook secret (already implemented)

### No changes needed for core logic
- Userbot continues to parse CardXabar messages
- Backend webhook remains unchanged
- Just ensure new premium tiers map correctly to prices

**Example flow**:
```
User selects "90-day Premium" → sees price 400,000 UZS
Admin set it as base 400000, with tiyin suffix (e.g., .17)
Userbot detects payment of 400,000.17 → matches to order
Backend activates 90-day premium
```

---

## Summary of Changes by File

| File | Change | Priority |
|------|--------|----------|
| `prisma/schema.prisma` | Add `Broadcast` model, `PremiumTier` model or update `Settings` | HIGH |
| `backend/src/routes/likes.ts` | Add gender-based access control + freemium limits | HIGH |
| `backend/src/routes/admin.ts` | Add `POST /api/admin/users/create`, remove seed endpoints | HIGH |
| `backend/src/broadcast/broadcast.ts` | New broadcast service with scheduling | HIGH |
| `backend/src/index.ts` | Integrate cron for scheduled broadcasts | MEDIUM |
| `backend/src/routes/premium.ts` | Add `GET /tiers`, update purchase flow | HIGH |
| `frontend/src/screens/Likes.tsx` | UI for limited access, premium prompts | HIGH |
| `frontend/src/admin/AdminAddUserForm.tsx` | New form component for manual user creation | HIGH |
| `frontend/src/admin/AdminBroadcast.tsx` | Enhanced broadcast page with media + scheduling | HIGH |
| `frontend/src/components/PremiumTierSelector.tsx` | New tier selector for checkout | HIGH |

---

## Testing Checklist

- [ ] Female freemium sees first 10 likes, limit enforced
- [ ] Female premium sees all likes
- [ ] Male freemium sees no likes (locked message)
- [ ] Male premium sees all likes
- [ ] Admin can create user with photos + custom data
- [ ] Seed endpoints removed or deprecated
- [ ] Broadcast: attach media, send successfully
- [ ] Broadcast: select single user from list
- [ ] Broadcast: schedule for specific hour, cron triggers
- [ ] Premium tiers display correctly (up to 4)
- [ ] Admin can configure tier pricing
- [ ] CardXabar userbot matches new tier prices

