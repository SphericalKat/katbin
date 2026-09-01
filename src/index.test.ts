import { describe, expect, it } from "vitest";

import { app } from "./index";

describe("Katbin shell", () => {
  it("serves the home page with secure headers and the existing navigation", async () => {
    const response = await app.request("https://katb.in/");
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("content-security-policy")).toContain("img-src 'self' https:");
    expect(response.headers.get("content-security-policy")).not.toContain("unsafe-inline");
    expect(body).toContain("&lt;Kat");
    expect(body).toContain("/users/register");
    expect(body).toContain("/users/log_in");
    expect(body).toContain("Paste, save, share!");
  });
});
