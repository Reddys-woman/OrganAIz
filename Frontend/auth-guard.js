/* =========================================================
   DASHBOARD AUTH GUARD
   Hide the page immediately, check if the visitor is logged
   in, and only reveal the dashboard if they are. Otherwise
   send them to the login page.
========================================================= */
document.documentElement.style.visibility = "hidden";

(async function guardDashboard() {
    const { data: { session }, error } = await sbClient.auth.getSession();
    if (error) {
        console.error("Auth check failed:", error.message);
    }
    if (!session) {
        window.location.href = "login.html";
        return;
    }
    document.documentElement.style.visibility = "visible";

    // Show the logged-in user's email as a tooltip on their avatar
    const profileImg = document.querySelector(".top-icons img");
    if (profileImg && session.user && session.user.email) {
        profileImg.title = session.user.email;
    }
})();

document.addEventListener("DOMContentLoaded", function () {
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async function () {
            await sbClient.auth.signOut();
            window.location.href = "login.html";
        });
    }
});
