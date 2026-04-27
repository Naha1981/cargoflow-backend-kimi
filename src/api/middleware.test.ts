import { authMiddleware, requireRoles } from "../middleware";
import { Request, Response } from "express";

describe("Auth middleware", () => {
  it("should reject missing authorization", () => {
    const req = { headers: {} } as Request;
    const res = {
      statusCode: 200,
      json: jest.fn(),
      status(code: number) {
        this.statusCode = code;
        return this;
      },
    } as unknown as Response;
    const next = jest.fn();

    authMiddleware(req as any, res, next);
    expect(res.statusCode).toBe(401);
  });

  it("should allow admin role for admin-only routes", () => {
    const req = { user: { role: "admin" } } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
    const next = jest.fn();

    requireRoles("admin", "ops")(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("should reject viewer for ops routes", () => {
    const req = { user: { role: "viewer" } } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
    const next = jest.fn();

    requireRoles("ops")(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
