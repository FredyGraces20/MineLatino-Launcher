<template>
  <div>
    <v-btn variant="tonal" prepend-icon="person" :loading="loading" @click="open">
      {{ account ? account.nick : 'Cuenta MineLatino' }}
    </v-btn>
    <v-dialog v-model="dialog" max-width="560">
      <v-card class="account-card">
        <v-card-title class="account-title">
          <span>{{ account ? 'Tu cuenta de cosméticos' : mode === 'register' ? 'Crear cuenta MineLatino' : 'Iniciar sesión' }}</span>
          <v-btn icon="close" variant="text" aria-label="Cerrar" @click="dialog = false" />
        </v-card-title>
        <v-card-text>
          <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>
          <template v-if="account">
            <div class="identity-box">
              <div><small>IDENTIDAD INTERNA</small><strong>{{ account.nick }}</strong><span>{{ account.accountId }}</span></div>
              <v-chip color="success" size="small" variant="tonal">Activa</v-chip>
            </div>
            <v-text-field v-model="email" label="Correo" type="email" autocomplete="email" />
            <v-text-field v-model="nick" label="Nick de Minecraft" maxlength="16" counter="16" />
            <p class="hint">El nick es visible y puede coincidir con el de otra cuenta. Tus compras pertenecen exclusivamente al ID interno.</p>
          </template>
          <template v-else>
            <div class="mode-tabs">
              <button :class="{ active: mode === 'register' }" @click="mode = 'register'">Crear cuenta</button>
              <button :class="{ active: mode === 'login' }" @click="mode = 'login'">Ya tengo cuenta</button>
            </div>
            <v-text-field v-model="email" label="Correo" type="email" autocomplete="email" />
            <v-text-field v-if="mode === 'register'" v-model="nick" label="Nick que usarás" maxlength="16" counter="16" />
            <v-text-field v-model="password" label="Contraseña" type="password" :autocomplete="mode === 'register' ? 'new-password' : 'current-password'" />
            <p class="hint">Esta cuenta funciona con Minecraft premium y no premium. La contraseña nunca se entrega al mod.</p>
          </template>
        </v-card-text>
        <v-card-actions class="account-actions">
          <template v-if="account">
            <v-btn color="error" variant="text" :disabled="loading" @click="removeAccount">Eliminar cuenta</v-btn>
            <v-btn variant="text" :disabled="loading" @click="logout">Cerrar sesión</v-btn>
            <v-spacer />
            <v-btn color="primary" :loading="loading" @click="save">Guardar cambios</v-btn>
          </template>
          <template v-else>
            <v-spacer />
            <v-btn color="primary" :loading="loading" @click="submit">
              {{ mode === 'register' ? 'Crear cuenta' : 'Entrar' }}
            </v-btn>
          </template>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { useService } from '@/composables/service'
import { MineLatinoServiceKey, type MineLatinoCosmeticsAccount } from '@xmcl/runtime-api'

const props = defineProps<{ suggestedNick?: string }>()
const emit = defineEmits<{ changed: [account: MineLatinoCosmeticsAccount | undefined] }>()
const service = useService(MineLatinoServiceKey)
const account = ref<MineLatinoCosmeticsAccount>()
const dialog = ref(false), loading = ref(false), error = ref(''), mode = ref<'register' | 'login'>('register')
const email = ref(''), nick = ref(''), password = ref('')

async function refresh() {
  loading.value = true
  try {
    account.value = await service.getCosmeticsAccount()
    emit('changed', account.value)
    email.value = account.value?.email || ''
    nick.value = account.value?.nick || props.suggestedNick || ''
  } finally { loading.value = false }
}
async function open() { dialog.value = true; error.value = ''; await refresh() }
async function submit() {
  error.value = ''; loading.value = true
  try {
    account.value = mode.value === 'register'
      ? await service.registerCosmeticsAccount({ email: email.value.trim(), password: password.value, nick: nick.value.trim() })
      : await service.loginCosmeticsAccount({ email: email.value.trim(), password: password.value })
    password.value = ''; email.value = account.value.email; nick.value = account.value.nick
    emit('changed', account.value)
  } catch (e) { error.value = e instanceof Error ? e.message : 'No se pudo iniciar la sesión' }
  finally { loading.value = false }
}
async function save() {
  error.value = ''; loading.value = true
  try { account.value = await service.updateCosmeticsAccount({ email: email.value.trim(), nick: nick.value.trim() }); emit('changed', account.value) }
  catch (e) { error.value = e instanceof Error ? e.message : 'No se pudo actualizar la cuenta' }
  finally { loading.value = false }
}
async function logout() {
  loading.value = true
  try { await service.logoutCosmeticsAccount(); account.value = undefined; emit('changed', undefined); password.value = ''; mode.value = 'login' }
  finally { loading.value = false }
}
async function removeAccount() {
  if (!confirm('¿Eliminar tu cuenta MineLatino? Se cerrarán todas las sesiones y dejarás de usar los cosméticos.')) return
  loading.value = true
  try { await service.deleteCosmeticsAccount(); account.value = undefined; emit('changed', undefined); dialog.value = false }
  catch (e) { error.value = e instanceof Error ? e.message : 'No se pudo eliminar la cuenta' }
  finally { loading.value = false }
}

onMounted(refresh)
</script>

<style scoped>
.account-card { background: #171a21 !important; border: 1px solid #ffffff20; border-radius: 20px !important; }
.account-title { display: flex; justify-content: space-between; align-items: center; white-space: normal; }
.identity-box { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 14px; margin-bottom: 18px; border: 1px solid #ffffff14; border-radius: 14px; background: #ffffff06; }
.identity-box div { min-width: 0; display: flex; flex-direction: column; }.identity-box small { color: #9ca3b4; font-size: 10px; letter-spacing: .12em; }.identity-box span { color: #8d94a5; font: 10px monospace; overflow-wrap: anywhere; }
.mode-tabs { display: grid; grid-template-columns: 1fr 1fr; padding: 4px; margin-bottom: 20px; border-radius: 12px; background: #0f1218; }.mode-tabs button { padding: 10px; border-radius: 9px; color: #9ca3b4; }.mode-tabs button.active { color: #f2f4f8; background: #ffffff10; }
.hint { color: #9ca3b4; font-size: 12px; line-height: 1.55; }.account-actions { padding: 10px 20px 18px; flex-wrap: wrap; }
</style>
