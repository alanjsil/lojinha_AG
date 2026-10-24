import assert from "node:assert/strict";
import { test } from "node:test";
import { endpointPushValido } from "../lib/push-endpoint.js";

test("aceita os serviços de push dos navegadores", () => {
  for (const u of [
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://updates-autopush.stage.mozaws.net.push.services.mozilla.com/wpush/v2/x",
    "https://db5p.notify.windows.com/?token=abc",
    "https://web.push.apple.com/QGxyz",
  ]) {
    assert.equal(endpointPushValido(u), true, u);
  }
});

test("recusa host interno, de terceiro e variações que enganam", () => {
  for (const u of [
    "https://169.254.169.254/latest/meta-data",
    "https://localhost/x",
    "https://exemplo.com/push",
    "https://fcm.googleapis.com.evil.com/x",
    "https://evil.com/fcm.googleapis.com/",
    "https://fcm.googleapis.com@evil.com/x",
    "https://user:senha@fcm.googleapis.com/x",
    "https://fcm.googleapis.com:8443/x",
    "https://evilnotify.windows.com.evil.com/x",
    "https://notify.windows.com/x",
    "https://xpush.apple.com.evil.com/",
    "http://fcm.googleapis.com/fcm/send/abc",
    "ftp://fcm.googleapis.com/x",
  ]) {
    assert.equal(endpointPushValido(u), false, u);
  }
});

test("recusa entrada que não é endereço", () => {
  for (const u of ["", null, undefined, 42, "fcm.googleapis.com", "javascript:alert(1)", {}]) {
    assert.equal(endpointPushValido(u), false, String(u));
  }
});
