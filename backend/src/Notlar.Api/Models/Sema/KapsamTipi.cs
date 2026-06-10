namespace Notlar.Api.Models.Sema;

// v18 Asama 17.1 - anahtar kapsami: bu anahtari kim doldurur?
public enum KapsamTipi
{
    Tenant,   // tenant admini doldurur (tenant-ozgu) - onboarding wizard + marka sayfasi
    Sistem,   // super admin doldurur, tum tenant'lara ortak deger - sema panelinde gorunur
}
