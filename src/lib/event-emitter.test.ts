import { emitEvent, EventTypes } from "./event-emitter";
import { query } from "./db";

jest.mock("./db");

const mockedQuery = query as jest.MockedFunction<typeof query>;

describe("Event emitter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedQuery.mockResolvedValue([{ id: "event-123" }]);
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  it("should insert event and publish to WebSocket", async () => {
    const result = await emitEvent({
      tenantId: "tenant-1",
      eventType: EventTypes.SHIPMENT_CREATED,
      payload: { shipmentId: "s1" },
    });

    expect(mockedQuery).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalled();
    expect(result.eventId).toBe("event-123");
  });

  it("should skip WebSocket when requested", async () => {
    await emitEvent({
      tenantId: "tenant-1",
      eventType: EventTypes.SHIPMENT_CREATED,
      payload: {},
      skipWebsocket: true,
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
