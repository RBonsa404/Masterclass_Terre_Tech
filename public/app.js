// Page d'inscription : fond animé, compte à rebours, places en direct, formulaire.
document.documentElement.classList.add('js');

const $ = (selecteur, racine = document) => racine.querySelector(selecteur);
const $$ = (selecteur, racine = document) => [...racine.querySelectorAll(selecteur)];
const calme = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ───── Fond : constellation de nœuds reliés, comme un circuit vu de haut ─────
(function ciel() {
  const toile = $('#ciel');
  const dessin = toile?.getContext('2d');
  if (!dessin) return;
  let largeur, hauteur, noeuds, souris = null, image = 0;
  const densite = () => Math.min(90, Math.round((innerWidth * innerHeight) / 21000));

  function mesurer() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    largeur = innerWidth;
    hauteur = innerHeight;
    toile.width = largeur * ratio;
    toile.height = hauteur * ratio;
    dessin.setTransform(ratio, 0, 0, ratio, 0, 0);
    noeuds = Array.from({ length: densite() }, (_, i) => ({
      x: Math.random() * largeur,
      y: Math.random() * hauteur,
      vx: (Math.random() - 0.5) * 0.28,
      vy: (Math.random() - 0.5) * 0.28,
      ambre: i % 7 === 0,
    }));
  }

  function tracer() {
    dessin.clearRect(0, 0, largeur, hauteur);
    const portee = 150;
    for (const n of noeuds) {
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < 0 || n.x > largeur) n.vx *= -1;
      if (n.y < 0 || n.y > hauteur) n.vy *= -1;
    }
    for (let i = 0; i < noeuds.length; i++) {
      const a = noeuds[i];
      for (let j = i + 1; j < noeuds.length; j++) {
        const b = noeuds[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < portee) {
          dessin.strokeStyle = `rgba(56, 189, 248, ${0.16 * (1 - d / portee)})`;
          dessin.lineWidth = 1;
          dessin.beginPath();
          dessin.moveTo(a.x, a.y);
          dessin.lineTo(b.x, b.y);
          dessin.stroke();
        }
      }
      if (souris) {
        const d = Math.hypot(a.x - souris.x, a.y - souris.y);
        if (d < 190) {
          dessin.strokeStyle = `rgba(251, 191, 36, ${0.35 * (1 - d / 190)})`;
          dessin.beginPath();
          dessin.moveTo(a.x, a.y);
          dessin.lineTo(souris.x, souris.y);
          dessin.stroke();
        }
      }
      dessin.fillStyle = a.ambre ? 'rgba(251, 191, 36, 0.85)' : 'rgba(56, 189, 248, 0.7)';
      dessin.beginPath();
      dessin.arc(a.x, a.y, a.ambre ? 2.2 : 1.6, 0, Math.PI * 2);
      dessin.fill();
    }
    if (!calme) image = requestAnimationFrame(tracer);
  }

  mesurer();
  tracer();
  let attente;
  addEventListener('resize', () => {
    clearTimeout(attente);
    attente = setTimeout(() => {
      cancelAnimationFrame(image);
      mesurer();
      tracer();
    }, 150);
  });
  addEventListener('pointermove', (e) => (souris = e.pointerType === 'mouse' ? { x: e.clientX, y: e.clientY } : null), { passive: true });
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(image);
    if (!document.hidden && !calme) image = requestAnimationFrame(tracer);
  });
})();

// ───── Apparition des blocs au défilement ─────
(function reveler() {
  const blocs = $$('.revele');
  if (!('IntersectionObserver' in window)) return blocs.forEach((b) => b.classList.add('visible'));
  const observateur = new IntersectionObserver(
    (entrees) => entrees.forEach((e) => e.isIntersecting && (e.target.classList.add('visible'), observateur.unobserve(e.target))),
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  blocs.forEach((b) => observateur.observe(b));
})();

// ───── Compte à rebours : ouverture de l'accueil, samedi 17 octobre 2026 à 8h00 (heure d'Ouagadougou, UTC) ─────
(function rebours() {
  const depart = Date.UTC(2026, 9, 17, 8, 0, 0);
  const cases = { jours: $('[data-rebours="jours"]'), heures: $('[data-rebours="heures"]'), minutes: $('[data-rebours="minutes"]'), secondes: $('[data-rebours="secondes"]') };
  if (!cases.jours) return;
  const deux = (n) => String(n).padStart(2, '0');
  function battre() {
    const reste = Math.max(0, depart - Date.now());
    const s = Math.floor(reste / 1000);
    cases.jours.textContent = deux(Math.floor(s / 86400));
    cases.heures.textContent = deux(Math.floor((s % 86400) / 3600));
    cases.minutes.textContent = deux(Math.floor((s % 3600) / 60));
    cases.secondes.textContent = deux(s % 60);
  }
  battre();
  setInterval(battre, 1000);
})();

// ───── Places : état lu sur le serveur, rafraîchi régulièrement ─────
const CIRCONFERENCE = 326.7;
let dernierEtat = null;

function compter(element, cible) {
  const depart = Number(element.dataset.valeur ?? cible);
  element.dataset.valeur = cible;
  if (calme || depart === cible || !Number.isFinite(depart)) return (element.textContent = cible);
  const debut = performance.now();
  const pas = (t) => {
    const p = Math.min(1, (t - debut) / 900);
    element.textContent = Math.round(depart + (cible - depart) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(pas);
  };
  requestAnimationFrame(pas);
}

function afficherEtat(etat) {
  const premier = dernierEtat === null;
  dernierEtat = etat;
  const part = etat.capacite ? etat.inscrits / etat.capacite : 0;
  $$('[data-places]').forEach((e) => {
    if (premier) e.dataset.valeur = etat.capacite;
    compter(e, etat.restantes);
  });
  $$('[data-places-libelle]').forEach((e) => (e.textContent = etat.restantes > 1 ? 'places restantes' : 'place restante'));
  $$('[data-inscrits]').forEach((e) => {
    if (premier) e.dataset.valeur = 0;
    compter(e, etat.inscrits);
  });
  $$('[data-capacite]').forEach((e) => (e.textContent = etat.capacite));
  const trait = $('[data-jauge-trait]');
  if (trait) trait.style.strokeDashoffset = String(CIRCONFERENCE * part);
  const progres = $('[data-progres]');
  if (progres) {
    progres.setAttribute('aria-valuemax', etat.capacite);
    progres.setAttribute('aria-valuenow', etat.inscrits);
    $('[data-progres-trait]').style.width = `${Math.min(100, part * 100)}%`;
  }
  const texte = $('[data-etat-texte]');
  if (texte) {
    texte.textContent = etat.complet
      ? 'Complet : toutes les places ont été attribuées.'
      : etat.cloturees
        ? 'Les inscriptions sont closes.'
        : `${etat.inscrits} inscrit${etat.inscrits > 1 ? 's' : ''} sur ${etat.capacite} places.`;
  }
  if (!etat.ouvert) fermer(etat);
}

function fermer(etat) {
  const zone = $('[data-reussite]');
  if (zone && !zone.hidden) return; // Une inscription vient d'aboutir : son billet reste affiché.
  $('#formulaire').hidden = true;
  const bloc = $('[data-complet]');
  bloc.hidden = false;
  if (etat.cloturees && !etat.complet) {
    $('.tampon', bloc).textContent = 'Clos';
    $('[data-complet-titre]').textContent = 'Les inscriptions sont closes';
    $('[data-complet-texte]').textContent = 'La période d’inscription est terminée. Suivez le Club Informatique pour être prévenu des prochaines activités.';
  } else {
    $('[data-complet-texte]').textContent = `Les ${etat.capacite} places de la masterclass sont réservées. Suivez le Club Informatique pour être prévenu des prochaines activités.`;
  }
  $$('[data-cta]').forEach((b) => (b.firstChild.textContent = etat.complet ? 'Complet ' : 'Inscriptions closes '));
}

async function lireEtat() {
  try {
    const reponse = await fetch('/api/etat', { cache: 'no-store' });
    if (reponse.ok) afficherEtat(await reponse.json());
  } catch {
    const texte = $('[data-etat-texte]');
    if (texte && !dernierEtat) texte.textContent = 'Places disponibles : indisponible pour le moment.';
  }
}
lireEtat();
setInterval(() => !document.hidden && lireEtat(), 20000);
document.addEventListener('visibilitychange', () => !document.hidden && lireEtat());

// ───── Formulaire ─────
(function formulaire() {
  const form = $('#formulaire');
  if (!form) return;
  const alerte = $('[data-alerte]');
  const bouton = $('[data-envoyer]');
  const libelle = $('[data-envoyer-texte]');

  const MESSAGES = {
    nom: 'Indiquez votre nom.',
    prenom: 'Indiquez votre prénom.',
    email: 'Indiquez une adresse électronique valide.',
    telephone: 'Indiquez un numéro de téléphone valide (8 chiffres au moins).',
    etablissement: 'Indiquez votre établissement.',
    filiere: 'Indiquez votre filière.',
    niveau: 'Choisissez votre niveau d’études.',
    consentement: 'Votre accord est nécessaire pour enregistrer l’inscription.',
  };

  function montrer(erreurs) {
    $$('[data-erreur]', form).forEach((e) => {
      const message = erreurs[e.dataset.erreur] ?? '';
      e.textContent = message;
      const champ = form.elements[e.dataset.erreur];
      champ?.closest('.champ')?.classList.toggle('invalide', !!message);
      if (champ) champ.setAttribute('aria-invalid', message ? 'true' : 'false');
    });
  }

  function controler() {
    const erreurs = {};
    for (const nom of ['nom', 'prenom', 'etablissement', 'filiere']) if (form.elements[nom].value.trim().length < 2) erreurs[nom] = MESSAGES[nom];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.elements.email.value.trim())) erreurs.email = MESSAGES.email;
    if (!/^\+?\d{8,15}$/.test(form.elements.telephone.value.replace(/[\s.-]/g, ''))) erreurs.telephone = MESSAGES.telephone;
    if (!form.elements.niveau.value) erreurs.niveau = MESSAGES.niveau;
    if (!form.elements.consentement.checked) erreurs.consentement = MESSAGES.consentement;
    return erreurs;
  }

  form.addEventListener('input', (e) => {
    const nom = e.target.name;
    const zone = $(`[data-erreur="${nom}"]`, form);
    if (zone?.textContent) {
      zone.textContent = '';
      e.target.closest('.champ')?.classList.remove('invalide');
      e.target.setAttribute('aria-invalid', 'false');
    }
  });

  form.addEventListener('submit', async (evenement) => {
    evenement.preventDefault();
    alerte.hidden = true;
    const erreurs = controler();
    montrer(erreurs);
    const premier = Object.keys(erreurs)[0];
    if (premier) return form.elements[premier].focus();

    const donnees = Object.fromEntries(new FormData(form));
    donnees.consentement = form.elements.consentement.checked;
    bouton.disabled = true;
    libelle.textContent = 'Réservation en cours…';
    try {
      const reponse = await fetch('/api/inscriptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(donnees) });
      const corps = await reponse.json().catch(() => ({}));
      if (reponse.status === 201 && corps.code) return reussir(donnees.prenom.trim(), corps);
      if (reponse.status === 422 && corps.erreurs) {
        montrer(corps.erreurs);
        form.elements[Object.keys(corps.erreurs)[0]]?.focus();
      } else if (corps.code === 'COMPLET' || corps.code === 'INSCRIPTIONS_CLOSES') {
        await lireEtat();
      } else {
        alerte.textContent =
          corps.code === 'DEJA_INSCRIT'
            ? 'Cette adresse électronique est déjà inscrite. Retrouvez votre billet grâce au lien reçu lors de votre inscription, ou écrivez au club.'
            : (corps.message ?? 'L’inscription n’a pas pu être enregistrée. Vérifiez votre connexion et réessayez.');
        alerte.hidden = false;
      }
    } catch {
      alerte.textContent = 'Connexion impossible. Vérifiez votre accès à Internet et réessayez.';
      alerte.hidden = false;
    } finally {
      bouton.disabled = false;
      libelle.textContent = 'Obtenir mon billet';
    }
  });

  function reussir(prenom, corps) {
    form.hidden = true;
    const zone = $('[data-reussite]');
    $('[data-reussite-prenom]').textContent = prenom;
    $('[data-reussite-code]').textContent = corps.code;
    $('[data-reussite-lien]').href = corps.billet;
    zone.hidden = false;
    zone.focus();
    try {
      localStorage.setItem('billet', corps.code);
    } catch {
      /* stockage indisponible : le lien affiché suffit */
    }
    lireEtat();
  }
})();
