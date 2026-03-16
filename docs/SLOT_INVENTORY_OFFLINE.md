# Slot Inventory for Offline Users — Line-by-Line Explanation

This document explains how **slot_inventory** is updated when staff assign an **offline user** (walk-in) to a table and time slot. Slot inventory is updated **at allocation time** (when you click "Assign"), not at payment time. That way, the same slot capacity is shared between online bookings and offline allocations.

---

## 1. Overview

- **When**: Slot inventory is updated when staff **create** or **delete** table allocations for an offline user (bookingId `"__offline__"` or `"offline_*"`).
- **Create (Assign)**: For each offline allocation that has `slotStartTime`, `slotEndTime`, and `sectionId`, we ensure a `slot_inventory` document exists for that slot, then atomically allocate seats (`bookedSeats` += guests, `remainingSeats` -= guests). If the slot is full, we return 400 and do **not** create the allocations.
- **Delete (Remove from table)**: Before deleting offline allocations, we release the same number of seats for each slot (`releaseSeats`), then delete the allocation documents.

---

## 2. Frontend: Building the allocation payload (booking-platform)

**File:** `TableBooking_frontend/src/app/admin/booking-platform/page.tsx`

### 2.1 Requiring a slot for offline users

```ts
if (isOffline && selectedSlotFilters.length === 0) {
  messageApi.warning("Select at least one time slot for the offline user so slot inventory can be updated.");
  return;
}
```

- For an **offline** user, at least one time slot must be selected. Otherwise we don’t know which slot to deduct capacity from, so we show a warning and don’t submit.

### 2.2 Parsing slot key and section from the first selected slot

```ts
let slotStartTime: string | undefined;
let slotEndTime: string | undefined;
let sectionId: string | undefined;
let sectionName: string | undefined;
if (isOffline && selectedSlotFilters.length > 0) {
  const firstKey = selectedSlotFilters[0];
  const tag = futureSlotTags.find((t) => t.key === firstKey);
  if (tag && tag.sectionIds.length > 0) {
    // Key format is "HH:mm-HH:mm" — split only on the single hyphen between the two times
    const dashIdx = firstKey.indexOf("-");
    if (dashIdx !== -1) {
      const startPart = firstKey.slice(0, dashIdx).trim();
      const endPart = firstKey.slice(dashIdx + 1).trim();
      if (startPart && endPart) {
        slotStartTime = startPart;
        slotEndTime = endPart;
        sectionId = tag.sectionIds[0];
        sectionName = mealTimes.find((r) => r._id === sectionId)?.sectionName ?? "Walk-in";
      }
    }
  }
}
```

- **firstKey**: e.g. `"19:00-20:00"` (one of the future slot tags the user selected).
- **tag**: The tag object for that key; it has `sectionIds` (meal-time section IDs, e.g. "dinner").
- We split the key **only on the first hyphen** between the two times so values like `"23:30-23:59"` become `slotStartTime = "23:30"`, `slotEndTime = "23:59"`.
- We set `sectionId` from the first section in the tag and `sectionName` from the meal-times list (for display and for the allocation doc).

### 2.3 Adding slot fields to each allocation item

```ts
const allocationPayload = tablesWithSeats.map((t) => {
  // ... tableKey, sectionIndex, tableIndex, bookingId, guestName, guestCount, guestsAtThisTable, status
  const item = {
    tableKey: tableKey(t.sectionIndex, t.tableIndex),
    // ...
    status: "running",
  };
  if (slotStartTime != null && slotEndTime != null && sectionId != null && sectionName != null) {
    item.slotStartTime = slotStartTime;
    item.slotEndTime = slotEndTime;
    item.sectionId = sectionId;
    item.sectionName = sectionName;
  }
  return item;
});
```

- Each allocation item sent to the backend includes **slotStartTime**, **slotEndTime**, **sectionId**, and **sectionName** when we have them (offline + slot selected). The backend uses these to update `slot_inventory`.

### 2.4 Sending the request

```ts
const result = await dispatch(
  createAllocations({ allocationDate, allocations: allocationPayload })
);
```

- **createAllocations** (from `adminAllocationsSlice`) POSTs `{ allocationDate, allocations }` to `/admin/table-allocations`. Each element of `allocations` can include `slotStartTime`, `slotEndTime`, `sectionId`, `sectionName`.

---

## 3. Frontend: Redux — createAllocations and delete

**File:** `TableBooking_frontend/src/redux/features/admin/adminAllocationsSlice.ts`

### 3.1 Create allocations (POST)

```ts
await api.post("/admin/table-allocations", payload);
```

- **payload** = `{ allocationDate: string, allocations: Array<...> }`. Each allocation can have `slotStartTime`, `slotEndTime`, `sectionId`, `sectionName`. The backend reads these and updates slot_inventory for offline allocations.

### 3.2 Remove allocations by bookingId (DELETE)

```ts
await api.delete(`/admin/table-allocations?bookingId=${encodeURIComponent(bookingId)}`);
```

- When staff remove an offline user from the table, the frontend calls DELETE with `bookingId` (e.g. `"__offline__"`). The backend then releases slot_inventory for that booking’s allocations (if they have slot info) and deletes the allocation documents.

---

## 4. Backend: Allocations handler — POST (create)

**File:** `TableBooking_backend/src/controllers/admin/allocations.handler.ts`

### 4.1 Detecting offline bookingId

```ts
function isOfflineBookingId(bookingId: string): boolean {
  return bookingId === "__offline__" || bookingId.startsWith("offline_");
}
```

- Offline users are identified by `bookingId === "__offline__"` or `bookingId.startsWith("offline_")`. Only these trigger slot_inventory updates in this handler.

### 4.2 Reading slot fields from the request body

```ts
const slotStartTime = typeof o.slotStartTime === "string" && o.slotStartTime.trim() ? o.slotStartTime.trim() : undefined;
const slotEndTime = typeof o.slotEndTime === "string" && o.slotEndTime.trim() ? o.slotEndTime.trim() : undefined;
const sectionId = typeof o.sectionId === "string" && o.sectionId.trim() ? o.sectionId.trim() : undefined;
const sectionName = typeof o.sectionName === "string" && o.sectionName.trim() ? o.sectionName.trim() : undefined;
allocations.push({
  // ...
  slotStartTime,
  slotEndTime,
  sectionId,
  sectionName,
});
```

- Each allocation in the request can carry optional **slotStartTime**, **slotEndTime**, **sectionId**, **sectionName**. They are normalized (trimmed) and stored on the allocation object we use for validation and DB insert.

### 4.3 Filtering offline allocations that have slot info

```ts
const offlineWithSlot = allocations.filter(
  (a) =>
    isOfflineBookingId(a.bookingId) &&
    a.slotStartTime &&
    a.slotEndTime &&
    a.sectionId
);
```

- We only touch slot_inventory for allocations that are **offline** and have **all three** slot identifiers. Online bookings don’t go through this path; they already consumed slot_inventory at booking-creation time.

### 4.4 Grouping guest count by slot (same slot can have multiple tables)

```ts
if (offlineWithSlot.length > 0) {
  const slotKey = (st: string, et: string, sid: string) => `${st}|${et}|${sid}`;
  const guestCountBySlot = new Map<string, number>();
  for (const a of offlineWithSlot) {
    const key = slotKey(a.slotStartTime!, a.slotEndTime!, a.sectionId!);
    const cur = guestCountBySlot.get(key) ?? 0;
    guestCountBySlot.set(key, cur + (a.guestsAtThisTable ?? 0));
  }
```

- One “offline” booking can be spread across several tables (e.g. 2 guests at table A, 3 at table B for the same slot). We group by **(slotStartTime, slotEndTime, sectionId)** and sum **guestsAtThisTable** so we allocate the **total** guest count once per slot.

### 4.5 Date and total seats for slot_inventory

```ts
  const bookingDate = new Date(allocationDate + "T00:00:00.000Z");
  const totalSeats = await slotInventory.getTotalSeatsFromTableMaster(req);
```

- **bookingDate**: The allocation date as a Date at midnight UTC (same as other slot_inventory APIs).
- **totalSeats**: Comes from `table_master` (e.g. config document). Used when **creating** a new slot_inventory document so we know the slot’s capacity.

### 4.6 Per-slot: ensure document, then allocate seats

```ts
  for (const [key, guestCount] of guestCountBySlot) {
    if (guestCount <= 0) continue;
    const [slotStartTime, slotEndTime, sectionIdStr] = key.split("|");
    let sectionId: ObjectId;
    try {
      sectionId = new ObjectId(sectionIdStr);
    } catch {
      res.status(400).json({ message: "Invalid sectionId for offline slot" });
      return;
    }
    await slotInventory.ensureSlotInventory({
      req,
      bookingDate,
      sectionId,
      slotStartTime,
      slotEndTime,
      totalSeats,
    });
    const allocated = await slotInventory.allocateSeats({
      req,
      bookingDate,
      sectionId,
      slotStartTime,
      slotEndTime,
      guestCount,
    });
    if (!allocated) {
      const remaining = await slotInventory.getRemainingSeats(req, bookingDate, sectionId, slotStartTime, slotEndTime);
      res.status(400).json({
        message: `Slot ${slotStartTime}–${slotEndTime} is full. Available only for ${remaining} guests.`,
      });
      return;
    }
  }
}
```

- **key** is `"slotStartTime|slotEndTime|sectionId"` (string). We split to get the three parts and convert **sectionId** to ObjectId.
- **ensureSlotInventory**: Creates a `slot_inventory` document for that (bookingDate, sectionId, slotStartTime, slotEndTime) if it doesn’t exist (upsert with `$setOnInsert`: totalSeats, bookedSeats=0, remainingSeats=totalSeats). Safe under concurrency.
- **allocateSeats**: Atomically decrements `remainingSeats` and increments `bookedSeats` by `guestCount`, but **only if** `remainingSeats >= guestCount`. Returns true if the update matched and modified a document, false otherwise.
- If **allocateSeats** returns false, the slot is full. We fetch **remaining** seats for the error message and respond with **400** and **do not** insert any allocations. So the whole request is all-or-nothing for slot_inventory.

### 4.7 Inserting allocation documents

```ts
    const now = new Date();
    const docs: Record<string, unknown>[] = allocations.map((a) => {
      const base = { allocationDate, tableKey, sectionIndex, tableIndex, bookingId, guestName, guestCount, guestsAtThisTable, status, allocatedBy, allocatedByName, createdAt: now, updatedAt: now };
      if (a.slotStartTime != null) base.slotStartTime = a.slotStartTime;
      if (a.slotEndTime != null) base.slotEndTime = a.slotEndTime;
      if (a.sectionId != null) base.sectionId = a.sectionId;
      if (a.sectionName != null) base.sectionName = a.sectionName;
      return base;
    });
    await db.create.insertMany({ req, connectionString, collection: "table_allocations", docs });
```

- Only after all slot_inventory updates succeed do we insert the **table_allocations** documents. Each doc stores the same slot fields so that on **delete** we know which slots to release.

---

## 5. Backend: Allocations handler — DELETE (remove offline user)

**File:** `TableBooking_backend/src/controllers/admin/allocations.handler.ts`

### 5.1 Delete by bookingId (query param)

```ts
if (bookingId) {
  const sanitized = bookingId.trim().slice(0, MAX_BOOKING_ID_LENGTH);
  // ...
  if (isOfflineBookingId(sanitized)) {
    const toDelete = (await db.read.find({
      req,
      connectionString,
      collection: "table_allocations",
      query: { bookingId: sanitized },
      limit: 100,
    })) as AllocationDoc[];
```

- When the client sends `DELETE ...?bookingId=__offline__` (or another offline id), we load all allocation documents for that **bookingId**.

### 5.2 Releasing seats for allocations that have slot info

```ts
    const withSlot = toDelete.filter((a) => a.slotStartTime && a.slotEndTime && a.sectionId);
    if (withSlot.length > 0) {
      const allocationDate = withSlot[0].allocationDate;
      const bookingDate = new Date(allocationDate + "T00:00:00.000Z");
      const slotKey = (st: string, et: string, sid: string) => `${st}|${et}|${sid}`;
      const guestCountBySlot = new Map<string, number>();
      for (const a of withSlot) {
        const key = slotKey(a.slotStartTime!, a.slotEndTime!, a.sectionId!);
        const cur = guestCountBySlot.get(key) ?? 0;
        guestCountBySlot.set(key, cur + (a.guestsAtThisTable ?? 0));
      }
      for (const [key, guestCount] of guestCountBySlot) {
        if (guestCount <= 0) continue;
        const [slotStartTime, slotEndTime, sectionIdStr] = key.split("|");
        try {
          const sectionId = new ObjectId(sectionIdStr);
          await slotInventory.releaseSeats({
            req,
            bookingDate,
            sectionId,
            slotStartTime,
            slotEndTime,
            guestCount,
          });
        } catch {
          // best-effort release; continue
        }
      }
    }
```

- **withSlot**: Only allocations that have slot info participate in slot_inventory.
- We group by the same **(slotStartTime, slotEndTime, sectionId)** and sum **guestsAtThisTable**.
- For each slot we call **releaseSeats**: it increments `remainingSeats` and decrements `bookedSeats` by `guestCount`. So the capacity is given back.
- Errors in release are swallowed (best-effort) so we still proceed to delete the allocation documents.

### 5.3 Deleting the allocation documents

```ts
    const result = await db.deleteOp.deleteMany({
      req,
      connectionString,
      collection: "table_allocations",
      query: { bookingId: sanitized },
    });
    res.status(200).json({ message: "Allocations removed", deletedCount: result.deletedCount });
```

- After releasing seats (for offline with slot), we delete all allocations for that **bookingId**.

---

## 6. Backend: Slot inventory service

**File:** `TableBooking_backend/src/services/slotInventory.ts`

### 6.1 ensureSlotInventory (create slot document if missing)

```ts
export async function ensureSlotInventory(params: EnsureSlotInventoryParams): Promise<void> {
  const { req, bookingDate, sectionId, slotStartTime, slotEndTime, totalSeats } = params;
  await db.update.updateOne({
    req,
    connectionString: CONNECTION_STRING,
    collection: "slot_inventory",
    query: {
      bookingDate,
      sectionId,
      slotStartTime,
      slotEndTime,
    },
    update: {
      $setOnInsert: {
        totalSeats,
        bookedSeats: 0,
        remainingSeats: totalSeats,
      },
    },
    options: { upsert: true },
  });
}
```

- **query**: Unique slot = (bookingDate, sectionId, slotStartTime, slotEndTime).
- **update**: `$setOnInsert` sets **totalSeats**, **bookedSeats**, **remainingSeats** only when the document is **inserted**. So if the document already exists (e.g. from an online booking), we don’t overwrite it. **upsert: true** creates the document if it doesn’t exist. This is the “lazy” creation of slot_inventory.

### 6.2 allocateSeats (consume capacity)

```ts
export async function allocateSeats(params: AllocateSeatsParams): Promise<boolean> {
  const { req, bookingDate, sectionId, slotStartTime, slotEndTime, guestCount } = params;
  const result = await db.update.updateOne({
    req,
    connectionString: CONNECTION_STRING,
    collection: "slot_inventory",
    query: {
      bookingDate,
      sectionId,
      slotStartTime,
      slotEndTime,
      remainingSeats: { $gte: guestCount },
    },
    update: {
      $inc: { bookedSeats: guestCount, remainingSeats: -guestCount },
    },
  });
  return (result.modifiedCount ?? 0) > 0;
}
```

- **query**: Same slot keys **and** `remainingSeats >= guestCount`. So the update runs only when there is enough capacity.
- **update**: `$inc`: add **guestCount** to **bookedSeats**, subtract **guestCount** from **remainingSeats**. One atomic update.
- **return**: true if one document was modified (allocation succeeded), false if no document matched (slot full or missing).

### 6.3 releaseSeats (return capacity on remove)

```ts
export async function releaseSeats(params: ReleaseSeatsParams): Promise<void> {
  const { req, bookingDate, sectionId, slotStartTime, slotEndTime, guestCount } = params;
  await db.update.updateOne({
    req,
    connectionString: CONNECTION_STRING,
    collection: "slot_inventory",
    query: {
      bookingDate,
      sectionId,
      slotStartTime,
      slotEndTime,
    },
    update: {
      $inc: { bookedSeats: -guestCount, remainingSeats: guestCount },
    },
  });
}
```

- Same slot keys. **$inc**: subtract **guestCount** from **bookedSeats**, add **guestCount** to **remainingSeats**. So when we remove an offline user from a table, we give the capacity back for that slot.

---

## 7. End-to-end flow summary

| Step | Where | What happens |
|------|--------|----------------|
| 1 | Frontend (booking-platform) | User selects “Offline user”, enters name, picks at least one time slot (e.g. 19:00–20:00), assigns tables. |
| 2 | Frontend | Slot key `"19:00-20:00"` is split into `slotStartTime` / `slotEndTime`; `sectionId` and `sectionName` come from the tag. Each allocation item in the payload gets these four fields. |
| 3 | Frontend | `createAllocations({ allocationDate, allocations })` → POST `/admin/table-allocations`. |
| 4 | Backend (allocations.handler) | Request parsed; allocations with `bookingId` offline and slot fields are collected into `offlineWithSlot`. |
| 5 | Backend | Guest counts grouped by (slotStartTime, slotEndTime, sectionId). For each group: **ensureSlotInventory** (create doc if needed), then **allocateSeats**. If any **allocateSeats** returns false → 400 “Slot full”, no allocations created. |
| 6 | Backend | If all allocations succeed, **table_allocations** documents are inserted (including slot fields). |
| 7 | On remove | Frontend calls DELETE with `bookingId`. Backend loads allocations for that id; for those with slot info, sums guests by slot and calls **releaseSeats** for each; then **deleteMany** by bookingId. |

Walk-in **payment** (POST `/admin/bookings/walk-in`) does **not** update slot_inventory; capacity was already consumed at allocation time. So offline users and online bookings share the same slot_inventory consistently.
