// Importing npm modules
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Router
const router = express.Router();

// Importing validation function
const validateForm = require("../utils/validateAdminLogin");
const validateCandidate = require("../utils/validateCandidate");

// Importing middlewares
const {
  ensureAuthentication,
  forwardAuthentication,
} = require("../middlewares/authAdmin");

// Importing admin & candidate model
const Admin = require("../models/admin");
const Candidate = require("../models/candidate");
const Voter = require("../models/voter");

/*
	HANDLING ROUTES
*/

// GET /admin/
router.get("/", ensureAuthentication, (req, res) => {
  res.redirect("/admin/dashboard");
});

// GET /admin/login
router.get("/login", forwardAuthentication, (req, res) => {
  res.render("admin/login", { title: "Login" });
});

// POST /admin/login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const errors = validateForm(username, password);
  if (errors.length > 0) {
    res.render("admin/login", { title: "Login", errors, username, password });
  } else {
    const admin = await Admin.findOne({ username: username });

    if (!admin) {
      res.status(400).render("admin/login", {
        title: "Login",
        error: "Invalid username / password",
        username,
        password,
      });
      return;
    }
    const passCheck = await bcrypt.compare(password, admin.password);
    if (!passCheck) {
      res.status(400).render("admin/login", {
        title: "Login",
        error: "Invalid username / password",
        username,
        password,
      });
      return;
    }

    const token = jwt.sign(
      { _id: admin._id, username: admin.username },
      process.env.JWT_KEY,
      { expiresIn: "1d" }
    );
    res.clearCookie("voterAuthToken");
    res.cookie("adminAuthToken", token, { maxAge: 24 * 60 * 60 * 1000 });
    res.redirect("/admin/dashboard");
  }
});

// GET /admin/dashboard
router.get("/dashboard", ensureAuthentication, async (req, res) => {
  const noOfCandidates = await election.methods.candidateCount().call();

  let result = await Voter.find();
  const noOfVoters = result.length;

  const electionStage = await election.methods.electionStage().call();

  res.render("admin/dashboard", {
    title: "Dashboard",
    noOfCandidates,
    noOfVoters,
    electionStage,
    admin: req.body.admin,
  });
});

// GET /admin/candidates
router.get("/candidates", ensureAuthentication, async (req, res) => {
  const noOfCandidates = await election.methods.candidateCount().call();

  let candidateIds = [];
  let candidateNames = [];
  let partyNames = [];
  let partySlogans = [];

  for (let i = 1; i <= noOfCandidates; i++) {
    const candidate = await election.methods.getCandidate(i.toString()).call();
    if (candidate._candidateName == "NOTA") {
      continue;
    }

    candidateIds.push(i);
    candidateNames.push(candidate._candidateName);
    partyNames.push(candidate._partyName);

    const dbCandidate = await Candidate.findOne({
      candidateId: i.toString(),
    });

    if (!dbCandidate) {
      res.render("500.ejs", { admin: req.body.admin });
      return;
    }
    partySlogans.push(dbCandidate.partySlogan);
  }

  res.render("admin/candidates", {
    title: "Candidates",
    noOfCandidates,
    candidateIds,
    candidateNames,
    partyNames,
    partySlogans,
    admin: req.body.admin,
  });
});

// GET /admin/addCandidate
router.get("/addCandidate", ensureAuthentication, async (req, res) => {
  const electionStage = await election.methods.electionStage().call();

  res.render("admin/addCandidate", {
    title: "Add Candidate",
    admin: req.body.admin,
    electionStage,
  });
});

// POST /admin/addCandidate
router.post("/addCandidate", ensureAuthentication, async (req, res) => {
  // Destructing variables
  const { candidateName, partyName, partySlogan } = req.body;

  const electionStage = await election.methods.electionStage().call();

  if (electionStage != 0) {
    req.flash("error_msg", "You are not in the candidate registration phase");
    res.redirect("/admin/dashboard");
    return;
  }
  // Validating form inputs
  const errors = validateCandidate(candidateName, partyName, partySlogan);

  // If form inputs are not valid
  if (errors.length > 0) {
    res.render("admin/addCandidate", {
      title: "Add Candidate",
      errors,
      candidateName,
      partyName,
      partySlogan,
      admin: req.body.admin,
    });
    return;
  } else {
    let candidateId;

    // Check if candidate is already present
    const checkCandidate = await Candidate.findOne({
      candidateName,
      partyName,
    });

    // If candidate is not present or is unique
    if (!checkCandidate) {
      try {
        // Transaction for adding candidate
        await election.methods
          .addCandidate(candidateName, partyName)
          .send({ from: adminAddress, gas: 3000000 });

        // Finding candidateId using smart contract function call
        candidateId = await election.methods.candidateCount().call();
      } catch (err) {
        console.log(err);
        res.render("admin/addCandidate", {
          title: "Add Candidate",
          error: "Error occurred. Please try again later...",
          candidateName,
          partyName,
          partySlogan,
          admin: req.body.admin,
        });
        return;
      }

      // Creating candidate object
      const candidate = new Candidate({
        candidateId,
        candidateName,
        partyName,
        partySlogan,
      });
      try {
        // Saving to database
        candidate.save();
      } catch (error) {
        res.render("admin/addCandidate", {
          title: "Add Candidate",
          error: "Error occurred. Please try again later...",
          candidateName,
          partyName,
          partySlogan,
          admin: req.body.admin,
        });
        return;
      }

      req.flash("success_msg", "Candidate added successfully");
      res.redirect("/admin/addCandidate");
    } else {
      // If candidate is already present
      res.render("admin/addCandidate", {
        title: "Add Candidate",
        error: "Candidate already present",
        candidateName,
        partyName,
        partySlogan,
        admin: req.body.admin,
      });
      return;
    }
  }
});

// GET /admin/changeState
router.get("/changeState", ensureAuthentication, async (req, res) => {
  const electionStage = await election.methods.electionStage().call();
  if (electionStage == 2) {
    req.flash("error_msg", "Invalid election stage change");
    res.redirect("/admin/dashboard");
    return;
  }

  try {
    await election.methods
      .changeElectionStage()
      .send({ from: adminAddress, gas: 3000000 });
  } catch (err) {
    console.log(err);
    req.flash("error_msg", "Invalid election stage change");
    res.redirect("/admin/dashboard");
  }

  req.flash("success_msg", "Election stage has been updated successfully");
  res.redirect("/admin/dashboard");
});

// GET /admin/results
router.get("/results", ensureAuthentication, async (req, res) => {
  const noOfCandidates = await election.methods.candidateCount().call();
  const electionStage = await election.methods.electionStage().call();

  let candidateNames = [];
  let partyNames = [];
  let voteCounts = [];

  for (let i = 1; i <= noOfCandidates; i++) {
    const candidate = await election.methods.getCandidate(i.toString()).call();
    candidateNames.push(candidate._candidateName);
    partyNames.push(candidate._partyName);
    voteCounts.push(candidate._voteCount);
  }

  res.render("admin/results", {
    title: "Results",
    noOfCandidates,
    candidateNames,
    partyNames,
    voteCounts,
    electionStage,
    admin: req.body.admin,
  });
});

// GET /admin/logout
router.get("/logout", (req, res) => {
  res.clearCookie("adminAuthToken");
  res.clearCookie("voterAuthToken");
  req.flash("success_msg", "You have been successfully logged out");
  res.redirect("/admin/login");
});

// Error routes
router.use((req, res, next) => {
  res.status(404).render("admin/404");
});

module.exports = router;
