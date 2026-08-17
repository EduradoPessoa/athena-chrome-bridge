// ====================================================================
// Athena Chrome Bridge — testes do cofre (node:test)
// Rode: node --test test/vault.test.mjs
// ====================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVault, unlock, encryptSecret, decryptSecret } from '../extension/vault.js';

test('createVault + unlock com senha certa', async () => {
  const meta = await createVault('Senha@123');
  const key = await unlock('Senha@123', meta);
  assert.ok(key instanceof CryptoKey);
});

test('unlock com senha errada → null', async () => {
  const meta = await createVault('Senha@123');
  assert.equal(await unlock('errada', meta), null);
});

test('encrypt/decrypt roundtrip', async () => {
  const meta = await createVault('Senha@123');
  const key = await unlock('Senha@123', meta);
  const blob = await encryptSecret(key, 'usuario\u0000minha-senha');
  assert.notEqual(blob.data, 'usuario\u0000minha-senha');
  assert.equal(await decryptSecret(key, blob), 'usuario\u0000minha-senha');
});

test('decrypt com chave errada falha (AES-GCM autentica)', async () => {
  const metaA = await createVault('Senha@123');
  const metaB = await createVault('Outra@456');
  const keyB = await unlock('Outra@456', metaB);
  const blob = await encryptSecret(await unlock('Senha@123', metaA), 'segredo');
  await assert.rejects(() => decryptSecret(keyB, blob));
});
