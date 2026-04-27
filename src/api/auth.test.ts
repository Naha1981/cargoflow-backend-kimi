import { authRouter } from "./auth";
import { query, withTransaction } from "../lib/db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

jest.mock("../lib/db");
jest.mock("bcrypt");
jest.mock("jsonwebtoken");

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedTransaction = withTransaction as jest.MockedFunction<typeof withTransaction>;
const mockedBcryptHash = bcrypt.hash as jest.MockedFunction<typeof bcrypt.hash>;
const mockedBcryptCompare = bcrypt.compare as jest.MockedFunction<typeof bcrypt.compare>;
const mockedJwtSign = jwt.sign as jest.MockedFunction<typeof jwt.sign>;

describe("Auth router", () => {
  const mockRes = () => {
    const res: any = { statusCode: 200 };
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedBcryptHash.mockResolvedValue("hashed_pw");
    mockedJwtSign.mockReturnValue("token_123");
  });

  it("should signup a new tenant and admin", async () => {
    mockedTransaction.mockImplementation(async (fn: any) => {
      return fn({
        query: jest.fn()
          .mockResolvedValueOnce([{ id: "tenant-1" }])
          .mockResolvedValueOnce([{ id: "user-1", tenant_id: "tenant-1", email: "a@b.com", role: "admin" }]),
      });
    });

    const req: any = { body: { email: "a@b.com", password: "secret", tenantName: "Acme" } };
    const res = mockRes();
    await authRouter.stack.find((r: any) => r.route?.path === "/signup")?.route.stack[0].handle(req, res);

    expect(mockedTransaction).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("should reject signup with missing fields", async () => {
    const req: any = { body: { email: "a@b.com" } };
    const res = mockRes();
    await authRouter.stack.find((r: any) => r.route?.path === "/signup")?.route.stack[0].handle(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("should login with valid credentials", async () => {
    mockedQuery.mockResolvedValue([
      { id: "user-1", tenant_id: "tenant-1", email: "a@b.com", password_hash: "hashed", role: "admin" },
    ]);
    mockedBcryptCompare.mockResolvedValue(true);

    const req: any = { body: { email: "a@b.com", password: "secret" } };
    const res = mockRes();
    await authRouter.stack.find((r: any) => r.route?.path === "/login")?.route.stack[0].handle(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ token: "token_123" })
    );
  });

  it("should reject login with invalid credentials", async () => {
    mockedQuery.mockResolvedValue([]);

    const req: any = { body: { email: "a@b.com", password: "secret" } };
    const res = mockRes();
    await authRouter.stack.find((r: any) => r.route?.path === "/login")?.route.stack[0].handle(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
