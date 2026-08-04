/**
 * Mini Hoops Manager — Schema dati (Mongoose / MongoDB)
 * ------------------------------------------------------
 * 4 collezioni: Player, Tournament, Registration, Match
 *
 * Regole di business incorporate:
 * - Un giocatore puo' iscriversi senza nome (privacy, minori) o senza numero maglia
 *   (assenza di pettorine numerate), ma non entrambi: almeno uno dei due deve esistere.
 * - Le squadre di ogni partita sono generate casualmente e non sono un'entita' persistente:
 *   vengono incorporate direttamente nel documento Match con uno "snapshot" di
 *   numero maglia / nome al momento della partita.
 * - Campi e gironi finali sono incorporati nel Tournament: sono pochi, bounded,
 *   e sempre letti insieme al torneo.
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ---------------------------------------------------------------------------
// Player — anagrafica riutilizzabile tra piu' tornei
// ---------------------------------------------------------------------------
const playerSchema = new Schema(
  {
    nome: { type: String, trim: true }, // opzionale per privacy
    cognome: { type: String, trim: true }, // opzionale per privacy
    dataNascita: { type: Date },
    contattoGenitore: { type: String, trim: true }, // uso interno organizzatori, mai pubblico
  },
  { timestamps: true }
);

const Player = mongoose.model('Player', playerSchema);

// ---------------------------------------------------------------------------
// Tournament — con campi e gironi finali incorporati (embedded)
// ---------------------------------------------------------------------------
const campoSchema = new Schema({
  nome: { type: String, required: true, trim: true },
});

const gironeFinaleSchema = new Schema({
  nomeTema: { type: String, required: true, trim: true }, // es. "Lakers", "Squali"
  livello: { type: Number, required: true, min: 1 }, // fascia di ranking, 1 = piu' alta
});

const tournamentSchema = new Schema(
  {
    nome: { type: String, required: true, trim: true },
    dataInizio: { type: Date, required: true },
    dataFine: { type: Date, required: true },
    categoria: { type: String, trim: true }, // fascia d'eta'
    puntiVittoria: { type: Number, default: 10, min: 1 },
    stato: {
      type: String,
      enum: ['pianificato', 'in_corso', 'concluso'],
      default: 'pianificato',
    },
    campi: { type: [campoSchema], default: [] },
    gironiFinali: { type: [gironeFinaleSchema], default: [] },
  },
  { timestamps: true }
);

const Tournament = mongoose.model('Tournament', tournamentSchema);

// ---------------------------------------------------------------------------
// Registration (Iscrizione) — collega Player <-> Tournament
// ---------------------------------------------------------------------------
const registrationSchema = new Schema(
  {
    torneoId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    giocatoreId: { type: Schema.Types.ObjectId, ref: 'Player', required: true },
    numeroMaglia: { type: Number, min: 0 }, // opzionale
    puntiRanking: { type: Number, default: 0 },
    partiteGiocate: { type: Number, default: 0 },
    vittorie: { type: Number, default: 0 },
    canestriFatti: { type: Number, default: 0 },
    canestriSubiti: { type: Number, default: 0 },
    // riferimento al sub-documento dentro tournament.gironiFinali (valorizzato solo in fase finale)
    gironeFinaleId: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

// un giocatore non puo' iscriversi due volte allo stesso torneo
registrationSchema.index({ torneoId: 1, giocatoreId: 1 }, { unique: true });

// vincolo: numeroMaglia oppure il nome del giocatore collegato devono esistere.
// non esprimibile con un validator sincrono di schema (serve leggere Player),
// quindi lo applichiamo in un hook pre-validate.
registrationSchema.pre('validate', async function (next) {
  if (this.numeroMaglia !== undefined && this.numeroMaglia !== null) return next();

  const player = await mongoose.model('Player').findById(this.giocatoreId).select('nome');
  if (!player || !player.nome) {
    return next(
      new Error(
        'Iscrizione non valida: serve almeno il numero maglia o il nome del giocatore collegato.'
      )
    );
  }
  next();
});

const Registration = mongoose.model('Registration', registrationSchema);

// ---------------------------------------------------------------------------
// Match (Partita) — con le squadre incorporate (embedded), snapshot dei giocatori
// ---------------------------------------------------------------------------
const giocatorePartitaSchema = new Schema(
  {
    iscrizioneId: { type: Schema.Types.ObjectId, ref: 'Registration', required: true },
    // snapshot al momento della partita: almeno uno dei due deve essere presente
    numeroMaglia: { type: Number, min: 0 },
    nome: { type: String, trim: true },
  },
  { _id: false }
);

giocatorePartitaSchema.pre('validate', function (next) {
  const haNumero = this.numeroMaglia !== undefined && this.numeroMaglia !== null;
  const haNome = !!this.nome;
  if (!haNumero && !haNome) {
    return next(new Error('Ogni giocatore in partita deve avere numero maglia o nome.'));
  }
  next();
});

const squadraSchema = new Schema(
  {
    squadra: { type: String, enum: ['A', 'B'], required: true },
    giocatori: {
      type: [giocatorePartitaSchema],
      validate: {
        validator: (arr) => arr.length === 3,
        message: 'Ogni squadra deve avere esattamente 3 giocatori (3 contro 3).',
      },
    },
  },
  { _id: false }
);

const matchSchema = new Schema(
  {
    torneoId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    // riferimento al sub-documento dentro tournament.campi
    campoId: { type: Schema.Types.ObjectId, required: true },
    // riferimento al sub-documento dentro tournament.gironiFinali (solo fase finale)
    gironeFinaleId: { type: Schema.Types.ObjectId, default: null },
    fase: { type: String, enum: ['qualificazione', 'finale'], required: true },
    dataOra: { type: Date, required: true },
    stato: {
      type: String,
      enum: ['programmata', 'in_corso', 'conclusa'],
      default: 'programmata',
    },
    punteggioA: { type: Number, default: 0, min: 0 },
    punteggioB: { type: Number, default: 0, min: 0 },
    squadre: {
      type: [squadraSchema],
      validate: {
        validator: (arr) => arr.length === 2,
        message: 'Una partita deve avere esattamente 2 squadre (A e B).',
      },
    },
  },
  { timestamps: true }
);

matchSchema.index({ torneoId: 1 });
matchSchema.index({ torneoId: 1, fase: 1 });
matchSchema.index({ torneoId: 1, gironeFinaleId: 1 });

const Match = mongoose.model('Match', matchSchema);

// ---------------------------------------------------------------------------
module.exports = { Player, Tournament, Registration, Match };
