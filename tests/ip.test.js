import assert from "node:assert/strict";
import { test } from "node:test";
import { hashDeIp, ipDoCliente, redeDoIp } from "../lib/ip.js";

const cab = (obj) => new Headers(obj);

test("ipDoCliente prefere x-real-ip e cai no primeiro do x-forwarded-for", () => {
  assert.equal(ipDoCliente(cab({ "x-real-ip": "200.1.2.3", "x-forwarded-for": "9.9.9.9" })), "200.1.2.3");
  assert.equal(ipDoCliente(cab({ "x-forwarded-for": "200.1.2.3, 10.0.0.1" })), "200.1.2.3");
  assert.equal(ipDoCliente(cab({})), "");
});

test("redeDoIp: IPv4 inteiro, IPv6 pelo prefixo /64", () => {
  assert.equal(redeDoIp("200.1.2.3"), "200.1.2.3");
  assert.equal(redeDoIp("::ffff:200.1.2.3"), "200.1.2.3");
  assert.equal(redeDoIp("2001:db8:aaaa:bbbb:1:2:3:4"), "2001:db8:aaaa:bbbb");
  assert.equal(redeDoIp("2001:DB8:aaaa:bbbb::1"), "2001:db8:aaaa:bbbb");
  assert.equal(redeDoIp("2001:db8::1"), "2001:db8:0:0");
  assert.equal(redeDoIp("::1"), "0:0:0:0");
  assert.equal(redeDoIp(""), "");
  assert.equal(redeDoIp(undefined), "");
});

test("hashDeIp: mesma rede dá o mesmo hash; segredo diferente, outro; sem IP ou segredo é null", () => {
  const a = hashDeIp("2001:db8:aaaa:bbbb:1:2:3:4", "segredo");
  assert.equal(a, hashDeIp("2001:db8:aaaa:bbbb:ffff:eeee:dddd:cccc", "segredo"));
  assert.notEqual(a, hashDeIp("2001:db8:aaaa:cccc::1", "segredo"));
  assert.notEqual(a, hashDeIp("2001:db8:aaaa:bbbb::1", "outro"));
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.equal(hashDeIp("", "segredo"), null);
  assert.equal(hashDeIp("1.2.3.4", ""), null);
  assert.equal(hashDeIp("1.2.3.4", undefined), null);
});
