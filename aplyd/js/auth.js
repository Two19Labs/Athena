/**
 * APLYD - Authentication, Persona Management & Role-Aware Navigation
 */

document.addEventListener("DOMContentLoaded", async () => {
  setupAppShell();
  setupPersonaBar();
});

function setupAppShell() {
  const currentUser = window.aplydStore.getCurrentUser();

  // Populate user header meta
  const userEmailEl = document.getElementById("userEmail");
  const userRoleEl = document.getElementById("userRole");
  const logoutBtn = document.getElementById("logoutBtn");

  if (userEmailEl) {
    userEmailEl.textContent = currentUser.full_name;
  }
  if (userRoleEl) {
    userRoleEl.textContent = currentUser.role.toUpperCase();
    userRoleEl.className = 'role-pill ' + (
      currentUser.role === 'admin' ? 'role-admin' :
      currentUser.role === 'supervisor' ? 'role-supervisor' : 'role-operator'
    );
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }

  // Enforce role-based sidebar visibility
  const navReview = document.getElementById("navReview");
  const navRegister = document.getElementById("navRegister");
  const navMachines = document.getElementById("navMachines");
  const navShifts = document.getElementById("navShifts");
  const navAnalytics = document.getElementById("navAnalytics");

  if (currentUser.role === 'operator') {
    // Operator has limited access: Capture and own submissions
    if (navMachines) navMachines.classList.add("hidden");
    if (navShifts) navShifts.classList.add("hidden");
  } else if (currentUser.role === 'supervisor') {
    // Supervisor cannot manage system configuration
    if (navMachines) navMachines.classList.add("hidden");
    if (navShifts) navShifts.classList.add("hidden");
  }
}

function setupPersonaBar() {
  const personaContainer = document.getElementById("demoPersonaBar");
  if (!personaContainer) return;

  const currentUser = window.aplydStore.getCurrentUser();

  personaContainer.innerHTML = `
    <span class="demo-persona-label">Demo Persona:</span>
    <button type="button" class="persona-btn ${currentUser.role === 'operator' ? 'active' : ''}" data-role="operator">
      👷 Operator (Ramesh)
    </button>
    <button type="button" class="persona-btn ${currentUser.role === 'supervisor' ? 'active' : ''}" data-role="supervisor">
      📋 Supervisor (Priya)
    </button>
    <button type="button" class="persona-btn ${currentUser.role === 'admin' ? 'active' : ''}" data-role="admin">
      ⚙️ Admin (Vikram)
    </button>
  `;

  personaContainer.querySelectorAll(".persona-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const role = e.currentTarget.getAttribute("data-role");
      const user = window.aplydStore.switchUser(role);
      if (window.toast) {
        window.toast.show(`Switched to demo persona: ${user.full_name} (${user.role})`);
      }
      setTimeout(() => {
        window.location.reload();
      }, 300);
    });
  });
}
