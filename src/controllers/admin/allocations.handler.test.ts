import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import {
  getTableAllocationsHandler,
  postTableAllocationsHandler,
  deleteTableAllocationsHandler,
} from "./allocations.handler";

const mocks = vi.hoisted(() => ({
  mockFind: vi.fn(),
  mockFindOne: vi.fn(),
  mockInsertMany: vi.fn(),
  mockDeleteMany: vi.fn(),
  mockDeleteOne: vi.fn(),
}));

vi.mock("../../databaseUtilities", () => ({
  default: {
    constants: { connectionStrings: { tableBooking: "tableBooking" } },
    read: { find: mocks.mockFind, findOne: mocks.mockFindOne },
    create: { insertMany: mocks.mockInsertMany },
    deleteOp: { deleteMany: mocks.mockDeleteMany, deleteOne: mocks.mockDeleteOne },
  },
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe("allocations.handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getTableAllocationsHandler", () => {
    it("returns 200 with data when db returns list", async () => {
      const list = [{ allocationDate: "2025-03-10", tableKey: "s0-t0", bookingId: "b1" }];
      mocks.mockFind.mockResolvedValue(list);
      const req = { query: { date: "2025-03-10" } } as unknown as Request;
      const res = mockRes();

      await getTableAllocationsHandler(req, res);

      expect(mocks.mockFind).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "table_allocations",
          query: { allocationDate: "2025-03-10" },
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: list });
    });

    it("uses today when date query missing or invalid", async () => {
      mocks.mockFind.mockResolvedValue([]);
      const req = { query: {} } as unknown as Request;
      const res = mockRes();

      await getTableAllocationsHandler(req, res);

      const allocationDate = (mocks.mockFind.mock.calls[0][0] as { query: { allocationDate: string } }).query.allocationDate;
      expect(/^\d{4}-\d{2}-\d{2}$/.test(allocationDate)).toBe(true);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("postTableAllocationsHandler", () => {
    it("returns 401 when user is missing", async () => {
      const req = { user: undefined, body: { allocationDate: "2025-03-10", allocations: [{ tableKey: "s0-t0", bookingId: "b1" }] } } as unknown as Request;
      const res = mockRes();

      await postTableAllocationsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
      expect(mocks.mockInsertMany).not.toHaveBeenCalled();
    });

    it("returns 400 when no valid allocations in body", async () => {
      const req = {
        user: { id: new ObjectId(), email: "a@b.com" },
        body: { allocationDate: "2025-03-10", allocations: [] },
      } as unknown as Request;
      const res = mockRes();

      await postTableAllocationsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "No valid allocations in body" });
    });

    it("returns 400 when too many allocations", async () => {
      const many = Array.from({ length: 51 }, (_, i) => ({ tableKey: "s0-t0", bookingId: `b${i}` }));
      const req = {
        user: { id: new ObjectId(), email: "a@b.com" },
        body: { allocationDate: "2025-03-10", allocations: many },
      } as unknown as Request;
      const res = mockRes();

      await postTableAllocationsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("Too many allocations") }));
    });

    it("returns 409 when booking already allocated", async () => {
      mocks.mockFindOne.mockResolvedValue({ _id: "config", sections: [{ tables: [{ seats: 4 }] }] });
      mocks.mockFind
        .mockResolvedValueOnce([
          { tableKey: "s0-t0", bookingId: "b1", allocatedByName: "Admin One", guestsAtThisTable: 2 },
        ])
        .mockResolvedValueOnce([]);
      const req = {
        user: { id: new ObjectId(), email: "b@b.com" },
        body: {
          allocationDate: "2025-03-10",
          allocations: [{ tableKey: "s0-t0", bookingId: "b1", guestsAtThisTable: 2 }],
        },
      } as unknown as Request;
      const res = mockRes();

      await postTableAllocationsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("already allocated"),
          code: "ALREADY_ALLOCATED",
        })
      );
      expect(mocks.mockInsertMany).not.toHaveBeenCalled();
    });

    it("returns 200 and inserts when valid and not duplicate", async () => {
      mocks.mockFindOne.mockResolvedValue({
        _id: "config",
        sections: [{ tables: [{ seats: 4 }] }],
      });
      mocks.mockFind.mockResolvedValue([]);
      mocks.mockInsertMany.mockResolvedValue({ insertedCount: 1 });
      const req = {
        user: { id: new ObjectId(), displayName: "Staff" },
        body: {
          allocationDate: "2025-03-10",
          allocations: [{ tableKey: "s0-t0", bookingId: "b1", guestsAtThisTable: 2 }],
        },
      } as unknown as Request;
      const res = mockRes();

      await postTableAllocationsHandler(req, res);

      expect(mocks.mockInsertMany).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Allocations created", count: 1 }));
    });
  });

  describe("deleteTableAllocationsHandler", () => {
    it("returns 400 when no bookingId or id", async () => {
      const req = { query: {}, params: {} } as unknown as Request;
      const res = mockRes();

      await deleteTableAllocationsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Provide query ?bookingId=... or path /:id" });
      expect(mocks.mockDeleteMany).not.toHaveBeenCalled();
      expect(mocks.mockDeleteOne).not.toHaveBeenCalled();
    });

    it("returns 400 when bookingId is empty after trim", async () => {
      const req = { query: { bookingId: "   " }, params: {} } as unknown as Request;
      const res = mockRes();

      await deleteTableAllocationsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Invalid bookingId" });
    });

    it("returns 200 and deletes by bookingId", async () => {
      mocks.mockDeleteMany.mockResolvedValue({ deletedCount: 2 });
      const req = { query: { bookingId: "b123" }, params: {} } as unknown as Request;
      const res = mockRes();

      await deleteTableAllocationsHandler(req, res);

      expect(mocks.mockDeleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ collection: "table_allocations", query: { bookingId: "b123" } })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ deletedCount: 2 }));
    });

    it("returns 404 when delete by id finds no document", async () => {
      mocks.mockDeleteOne.mockResolvedValue({ deletedCount: 0 });
      const id = new ObjectId();
      const req = { query: {}, params: { id: id.toString() } } as unknown as Request;
      const res = mockRes();

      await deleteTableAllocationsHandler(req, res);

      expect(mocks.mockDeleteOne).toHaveBeenCalledWith(
        expect.objectContaining({ query: { _id: id } })
      );
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Allocation not found" });
    });

    it("returns 200 when delete by id succeeds", async () => {
      mocks.mockDeleteOne.mockResolvedValue({ deletedCount: 1 });
      const id = new ObjectId();
      const req = { query: {}, params: { id: id.toString() } } as unknown as Request;
      const res = mockRes();

      await deleteTableAllocationsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "Allocation removed" });
    });
  });
});
