import { expect, test, type Browser, type Page } from "@playwright/test";

async function joinAs(
  browser: Browser,
  code: string,
  name: string,
): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/join?code=${code}`);
  await page.getByLabel("Username").fill(name);
  await page.getByRole("button", { name: "Join game" }).click();
  await expect(page).toHaveURL(new RegExp(`/play/${code}$`));
  await expect(page.getByText(/You're on/)).toBeVisible();
  return page;
}

test("a teacher and two students play one game together", async ({
  browser,
}) => {
  const teacher = await (await browser.newContext()).newPage();
  await teacher.goto("/teach");
  await teacher.getByRole("radio", { name: "2" }).click();
  await teacher.getByRole("button", { name: "Create game" }).click();
  await expect(teacher).toHaveURL(/\/teach\/[A-Z0-9]{5}$/);
  const code =
    (await teacher.getByTestId("join-code").textContent())?.trim() ?? "";

  const ana = await joinAs(browser, code, "Ana");
  const ben = await joinAs(browser, code, "Ben");
  await expect(teacher.getByText("2 students")).toBeVisible();

  await teacher.getByRole("button", { name: "Start game" }).click();
  await expect(ana.getByText(/Day [1-9]/)).toBeVisible({ timeout: 15_000 });

  // The advisor suggests a first step.
  await expect(ana.getByRole("region", { name: "Advisor" })).toContainText(
    /Farm/,
  );

  // Ana builds a farm from the spot picker.
  await ana.getByRole("button", { name: /^Farm/ }).click();
  await ana
    .getByRole("button", { name: /^Build here/ })
    .first()
    .click();
  await expect(ana.getByText(/Farm built/)).toBeVisible();

  // Ben's own connection receives Ana's farm.
  const benDebug = await ben.context().newPage();
  await benDebug.goto(`/debug/${code}`);
  await expect(benDebug.getByTestId("debug-status")).toHaveText("connected");
  await expect(benDebug.locator("pre")).toContainText('"kind": "farm"');

  // The teacher calls a Town Meeting; both students vote; the season ends.
  await teacher.getByRole("checkbox", { name: /River Protection/ }).check();
  await teacher.getByRole("button", { name: "Call a Town Meeting" }).click();
  for (const student of [ana, ben]) {
    await expect(
      student.getByRole("heading", { name: /Time to vote/ }),
    ).toBeVisible();
    await student.getByRole("button", { name: /Yes/ }).click();
  }
  await expect(teacher.getByText("2 of 2 cities have voted.")).toBeVisible();
  await teacher.getByRole("button", { name: /Close voting/ }).click();
  for (const student of [ana, ben]) {
    await expect(student.getByText("Season 1 report")).toBeVisible();
  }

  // Ana answers the reflection question; the teacher reads it.
  await ana.getByLabel("Your answer").fill("We should share the river.");
  await ana.getByRole("button", { name: "Share with my teacher" }).click();
  await expect(teacher.getByText("We should share the river.")).toBeVisible();
  await expect(teacher.getByText(/Ana · .* · season 1/)).toBeVisible();

  const projector = await (await browser.newContext()).newPage();
  await projector.goto(`/projector/${code}`);
  await expect(
    projector.getByRole("listitem").filter({ hasText: "River Protection" }),
    // Headless Chromium renders WebGL in software, so the first load is slow.
  ).toContainText("✅", { timeout: 20_000 });
});

test.describe("devices", () => {
  test("phones get a friendly block instead of the game", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      screen: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto("/join");
    await expect(page.getByTestId("device-gate")).toBeVisible();
    await expect(page.getByRole("button", { name: "Join game" })).toHaveCount(
      0,
    );
  });

  test("iPads can play", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 810, height: 1080 },
      screen: { width: 810, height: 1080 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto("/join");
    await expect(page.getByRole("button", { name: "Join game" })).toBeVisible();
  });
});
