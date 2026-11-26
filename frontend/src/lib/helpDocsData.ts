export type RoleId = "student" | "faculty" | "director";

export interface ScreenshotPin {
  number: number;
  label: string;
}

export interface ScreenshotSlot {
  suggestedPath: string;
  caption: string;
  pins?: ScreenshotPin[];
}

export interface DocStep {
  title: string;
  description: string;
  uiPills?: Array<{
    label: string;
    variant?:
      | "primary"
      | "utility"
      | "danger"
      | "status-green"
      | "status-amber"
      | "status-orange"
      | "field";
  }>;
  note?: string;
  noteType?: "tip" | "important" | "warning";
  screenshot?: ScreenshotSlot;
}

export interface DocArticle {
  id: string;
  slug: string;
  role: RoleId;
  guideCode: string;
  title: string;
  summary: string;
  readTimeMinutes: number;
  lastUpdated: string;
  screenshotSlot?: ScreenshotSlot;
  overview: string;
  steps: DocStep[];
  faq?: Array<{ question: string; answer: string }>;
}

export interface RoleTrack {
  id: RoleId;
  label: string;
  badge: string;
  description: string;
  iconName: "GraduationCap" | "Users" | "Building2";
  articles: DocArticle[];
}

export const HELP_ROLE_TRACKS: RoleTrack[] = [
  {
    id: "student",
    label: "Student Manual",
    badge: "Students",
    description:
      "App installation, signing in, camera scanning, results & standings, revaluations, password recovery, active devices, and Google Drive backup.",
    iconName: "GraduationCap",
    articles: [
      {
        id: "s-01",
        slug: "pwa-and-account-claim",
        role: "student",
        guideCode: "S-01",
        title: "Installing the App, Claiming Your ID & Signing In",
        summary:
          "How to add PaperGrade to your phone home screen, activate your student account for the first time, and sign in with your password or Google.",
        readTimeMinutes: 4,
        lastUpdated: "November 2026",
        screenshotSlot: {
          suggestedPath: "/docs/student/welcome-portal.png",
          caption:
            "Figure 1.1: PaperGrade portal welcome screen with sign-in and account activation options.",
          pins: [
            { number: 1, label: "PaperGrade header & navigation" },
            { number: 2, label: "Student Portal sign-in button" },
            { number: 3, label: "Claim Student ID activation button" },
          ],
        },
        overview:
          "Installing PaperGrade on your phone gives you one-tap access from your home screen, full-screen camera scanning during exams, and keeps you signed in for 7 days so you are ready before every test starts.",
        steps: [
          {
            title: "1. Install on iPhone or iPad (Safari)",
            description:
              "Open the PaperGrade link in Safari and tap the Share icon at the bottom of the screen. Scroll down and tap 'Add to Home Screen', then tap 'Add' in the top-right corner to place the PaperGrade icon on your home screen.",
            note: "Always use Safari on iPhone or iPad for installation so home-screen mode and camera permissions work smoothly.",
            noteType: "tip",
            screenshot: {
              suggestedPath: "/docs/student/ios-install-banner.png",
              caption:
                "Step-by-step instructions to add PaperGrade to your iPhone home screen.",
              pins: [
                { number: 1, label: "Install PaperGrade on iPhone banner" },
                { number: 2, label: "Tap Safari Share button" },
                { number: 3, label: "Tap Add to Home Screen" },
                { number: 4, label: "Tap Add in top-right corner" },
              ],
            },
          },
          {
            title: "2. Install on Android (Chrome)",
            description:
              "Open PaperGrade in Google Chrome and accept the 'Install App' prompt—or go to the Student sign-in tab and tap 'Install Student App on this Device' below the sign-in form.",
            uiPills: [
              { label: "Install Student App on this Device", variant: "utility" },
            ],
            note: "Your login stays active for 7 days. Sign in before reaching your exam classroom so you can start scanning right away.",
            noteType: "important",
          },
          {
            title: "3. Activate a New Student Account (First Time Only)",
            description:
              "On the sign-in screen, switch to 'Claim Account'. Enter your institute Roll Number (or Student ID) and tap 'Verify & Check Status'. Set a personal password of at least 8 characters, confirm it, and tap 'Claim Account & Sign In'.",
            uiPills: [
              { label: "Claim Account", variant: "utility" },
              { label: "Verify & Check Status", variant: "primary" },
              { label: "Password", variant: "field" },
              { label: "Confirm Password", variant: "field" },
              { label: "Claim Account & Sign In", variant: "primary" },
            ],
            note: "You only claim your account once when joining. Afterwards, sign in directly on the Student tab.",
            noteType: "warning",
            screenshot: {
              suggestedPath: "/docs/student/account-claim.png",
              caption:
                "Roll Number verification screen for activating your student account.",
              pins: [
                { number: 1, label: "Claim Account tab" },
                { number: 2, label: "Roll Number / Student ID input" },
                { number: 3, label: "Verify & Check Status button" },
              ],
            },
          },
          {
            title: "4. Sign In with Password or Google",
            description:
              "On the Student tab, sign in with your Roll Number or Email and password via 'Sign In to Student Portal', or tap the Google button ('Continue with Google') if your email matches your student profile or linked Google account.",
            uiPills: [
              { label: "Sign In to Student Portal", variant: "primary" },
              { label: "Continue with Google", variant: "utility" },
            ],
            screenshot: {
              suggestedPath: "/docs/student/account-claim-success.png",
              caption:
                "Account activation confirmation leading directly to your Student Portal.",
            },
          },
          {
            title: "5. Notifications & Menu Navigation",
            description:
              "Once signed in, use the Bell icon in the top bar to view announcements and your Profile Avatar to open Account Settings (where you can manage Google Drive backup, signed-in devices, and Sign Out). When asked, tap 'Enable Device Notifications' to get phone alerts whenever exam windows open or results are published.",
            uiPills: [{ label: "Enable Device Notifications", variant: "primary" }],
            screenshot: {
              suggestedPath: "/docs/student/student-navigation-drawer.png",
              caption:
                "Mobile menu providing quick access to your Portal, Revaluations, Notifications, Account Settings, and User Manual.",
            },
          },
        ],
        faq: [
          {
            question: "What does 'Already Claimed' mean when trying to Claim Account?",
            answer:
              "Your Roll Number already has a password. Switch to the Student tab to sign in—or tap 'Forgot password?' to reset it.",
          },
          {
            question: "Why didn't Google Sign-In recognize my Gmail address?",
            answer:
              "If your Google email is different from the email registered with your institute, sign in with your Roll Number first and link your Google account inside Account Settings.",
          },
        ],
      },
      {
        id: "s-02",
        slug: "taking-exams-and-scanning",
        role: "student",
        guideCode: "S-02",
        title: "Taking Live Exams & Scanning Answer Sheets",
        summary:
          "How to choose an active exam window, photograph handwritten answer pages clearly, reorder sheets, and submit or replace your paper before the deadline.",
        readTimeMinutes: 4,
        lastUpdated: "November 2026",
        overview:
          "Whenever your teacher opens an exam submission window for your batch or branch, an active upload card appears right at the top of your Student Portal.",
        steps: [
          {
            title: "1. Find Your Active Exam Window",
            description:
              "Open the Student Portal. Live exams display a green 'Submission Window Open' badge with a live countdown timer. If more than one exam window is open at the same time, use the '{N} Exam Windows Currently Open' bar to pick the exam you want to submit.",
            uiPills: [
              { label: "Submission Window Open", variant: "status-green" },
              { label: "Grace Period (2m)", variant: "status-orange" },
              { label: "Window Closed", variant: "utility" },
            ],
            note: "If the countdown hits 00:00 while you are finishing up, an extra 2-minute 'Grace Period (2m)' buffer gives you time to complete your upload.",
            noteType: "important",
            screenshot: {
              suggestedPath: "/docs/student/active-exam-camera.gif",
              caption:
                "Live submission flow: opening an active exam, scanning handwritten pages with your phone camera, and submitting.",
            },
          },
          {
            title: "2. Photograph Pages Using Camera or Gallery",
            description:
              "Tap 'Scan Page (Camera)' for your first answer sheet, hold your phone steadily above the page in good lighting, and capture the photo. To add more sheets, tap '+ Scan Next Page (Camera)' or 'Add Photos' to select photos from your phone gallery.",
            uiPills: [
              { label: "Scan Page (Camera)", variant: "primary" },
              { label: "+ Scan Next Page (Camera)", variant: "primary" },
              { label: "Add Photos", variant: "utility" },
            ],
            note: "Make sure all four corners of your page and every question number are clearly readable in the photo.",
            noteType: "tip",
          },
          {
            title: "3. Check Thumbnails & Reorder Pages",
            description:
              "Preview every captured page thumbnail. Long-press and drag any page into exact order from first page to last, or remove any blurry shot and retake it.",
            screenshot: {
              suggestedPath: "/docs/student/page-rearranging.gif",
              caption:
                "Dragging captured page thumbnails into proper chronological order before submitting.",
            },
          },
          {
            title: "4. Submit or Replace Within the Time Window",
            description:
              "When all pages are in order, tap 'Submit Answer Sheet'. Once uploaded, your card displays 'Answer Sheet Submitted' with a 'Recorded' badge. If you spot a missing page while the window is still open and replacements are allowed, you can re-scan and tap 'Submit Answer Sheet' again—or tap 'Keep Current' to leave your original upload untouched.",
            uiPills: [
              { label: "Submit Answer Sheet", variant: "primary" },
              { label: "Recorded", variant: "status-green" },
              { label: "Keep Current", variant: "utility" },
            ],
            note: "Always wait until you see the 'Answer Sheet Submitted' confirmation before closing the app.",
            noteType: "warning",
          },
        ],
        faq: [
          {
            question: "What happens if time runs out while I am taking photos?",
            answer:
              "You get an automatic 2-minute 'Grace Period (2m)' after the main timer ends to complete your upload. If you missed the window completely, contact your teacher or invigilator to reopen submissions for unsubmitted students.",
          },
        ],
      },
      {
        id: "s-03",
        slug: "results-rankings-and-keys",
        role: "student",
        guideCode: "S-03",
        title: "Viewing Graded Papers, Performance Charts, Class Standings & Keys",
        summary:
          "How to review step-by-step marks, switch performance chart views, inspect your graded script, check 3D Class Standings, and view official Question Papers & Answer Keys.",
        readTimeMinutes: 5,
        lastUpdated: "November 2026",
        overview:
          "Once results are published, your graded answer script, step-by-step marks breakdown, official solutions, and class standings become available inside the Student Portal.",
        steps: [
          {
            title: "1. Performance Trajectory Chart",
            description:
              "On your Student Portal dashboard, your Performance Chart tracks scores across subjects such as Physics, Chemistry, Maths, Biology, and any institute subjects. Switch between 'Percent' (individual test percentages) and 'Cumulative' views, or filter by a specific subject. Hover over any point on the chart to inspect exact test scores.",
            uiPills: [
              { label: "Percent", variant: "primary" },
              { label: "Cumulative", variant: "utility" },
            ],
            screenshot: {
              suggestedPath: "/docs/student/student-dashboard-trajectory.png",
              caption:
                "Student Dashboard showing score summary counters, Google Drive status, and subject trajectory chart.",
              pins: [
                { number: 1, label: "Score summary cards" },
                { number: 2, label: "Performance trajectory chart" },
                { number: 3, label: "Subject filter buttons" },
              ],
            },
          },
          {
            title: "2. Past Exams & Available Actions",
            description:
              "Open the 'Past Exams' tab to view completed exams. Each exam card displays how many days the full script PDF remains available ('15d retention', 'Nd until purge', or 'PDF Archived') along with quick buttons: 'Inspect in PDF Viewer ->', 'View Summary', 'Class Standings', 'QP & Key', 'Backup to Drive' (or 'In Drive'), 'Download PDF', and 'Request Revaluation'.",
            uiPills: [
              { label: "Inspect in PDF Viewer ->", variant: "primary" },
              { label: "View Summary", variant: "utility" },
              { label: "Class Standings", variant: "utility" },
              { label: "QP & Key", variant: "utility" },
              { label: "Backup to Drive", variant: "utility" },
            ],
            screenshot: {
              suggestedPath: "/docs/student/exam-card-actions.png",
              caption:
                "Completed exam card showing score, retention badge, and action buttons.",
            },
          },
          {
            title: "3. Question Breakdown & Full Paper Viewer",
            description:
              "Tap 'View Summary' for a question-by-question breakdown showing your recognized answer, the official solution, detailed grading feedback, and a crop of your handwritten work (use 'Expand All Details' to view every step at once). Tap 'Inspect in PDF Viewer ->' to open your complete answer sheet with highlighted question regions and marks beside each answer.",
            uiPills: [
              { label: "Expand All Details", variant: "utility" },
              { label: "Question Paper & Key", variant: "utility" },
            ],
            screenshot: {
              suggestedPath: "/docs/student/graded-viewer.png",
              caption:
                "Graded paper viewer showing your scanned pages alongside question-level step scores and feedback.",
            },
            note: "Each question card breaks down marks step by step so you can see exactly where full or partial credit was awarded.",
            noteType: "tip",
          },
          {
            title: "4. 3D Class Standings & Privacy",
            description:
              "Tap 'Class Standings' on any published exam card (or inside 'View Summary') to view your ranking. Top-3 scorers appear on a 3D podium. In the standings table below, only Rank, Student Name, and Score are shown—Roll Numbers are hidden for privacy, and your own row is highlighted with a 'YOU' badge.",
            uiPills: [
              { label: "Class Standings", variant: "utility" },
              { label: "YOU", variant: "status-green" },
            ],
            screenshot: {
              suggestedPath: "/docs/student/class-standings-modal.png",
              caption:
                "Class Standings view showing student ranks and scores without exposing roll numbers.",
            },
          },
          {
            title: "5. Viewing Question Papers & Official Answer Keys",
            description:
              "Tap 'QP & Key' on an exam card—or 'Question Paper & Key' inside the paper viewer—to read the official Question Paper and Answer Key side by side. Use 'Open in Tab' or 'Download PDF' to keep a copy for revision.",
            uiPills: [
              { label: "Open in Tab", variant: "utility" },
              { label: "Download PDF", variant: "utility" },
            ],
            screenshot: {
              suggestedPath: "/docs/student/master-qp-answer-key-viewer.png",
              caption:
                "Question Paper and Official Answer Key document viewer.",
            },
          },
        ],
      },
      {
        id: "s-04",
        slug: "revaluations-and-bug-reports",
        role: "student",
        guideCode: "S-04",
        title: "Requesting Revaluation Appeals & Reporting Issues",
        summary:
          "How to request a teacher re-check on specific questions, follow appeal decisions, and report app or portal issues.",
        readTimeMinutes: 4,
        lastUpdated: "November 2026",
        overview:
          "If you think a valid step or alternative solution in your answer sheet was missed, you can raise a Revaluation Appeal. If you run into a technical problem with the portal, use Report Issue to notify support.",
        steps: [
          {
            title: "1. Submit a Revaluation Appeal",
            description:
              "From a Past Exam card, tap 'Request Revaluation', select one or more questions (or tap 'Select All'), type a clear explanation under 'Academic Justification / Grievance Details:', and tap 'Submit Appeal'. You can also open your paper in the viewer, tap any question, choose 'Request Revaluation', explain why your answer should be reviewed, and tap 'Submit Appeal'.",
            uiPills: [
              { label: "Request Revaluation", variant: "utility" },
              { label: "Select All", variant: "utility" },
              { label: "Submit Appeal", variant: "primary" },
            ],
            note: "Specific notes (such as 'Q4 used energy conservation on the lower half of the page') help teachers review your appeal faster.",
            noteType: "tip",
            screenshot: {
              suggestedPath: "/docs/student/revaluation-modal.png",
              caption:
                "Revaluation Appeal dialog for selecting questions and explaining your review request.",
            },
          },
          {
            title: "2. Track Appeal Decisions Under Revaluations",
            description:
              "Open 'Revaluations' from the menu to filter by 'All Appeals', 'Under Review', 'Marks Revised', or 'Marks Upheld'. Each appeal displays its status badge ('Under Faculty Review', 'Marks Revised (+Xm)', or 'Evaluation Upheld') along with the teacher's decision note.",
            uiPills: [
              { label: "Under Faculty Review", variant: "status-amber" },
              { label: "Marks Revised (+Xm)", variant: "status-green" },
              { label: "Evaluation Upheld", variant: "utility" },
            ],
            screenshot: {
              suggestedPath: "/docs/student/my-revaluation-appeals.png",
              caption:
                "Student Revaluation tracker displaying appeal status filters and teacher feedback.",
            },
          },
          {
            title: "3. Report a Portal Problem",
            description:
              "If you experience an upload problem, login issue, or display error, tap 'Report Issue' in your Student Portal header (or 'Report Technical Issue' in the Support card). Select a category—PDF Upload / Submission Problem, Marks & Evaluation Display Issue, Login & Authentication Problem, Page Visual Glitch / Mobile Layout, or Other Technical Issue—attach an optional screenshot, and tap 'Submit Technical Report'.",
            uiPills: [
              { label: "Report Issue", variant: "utility" },
              { label: "Submit Technical Report", variant: "primary" },
            ],
            screenshot: {
              suggestedPath: "/docs/student/report-issue-modal.png",
              caption:
                "Issue reporting dialog with category choices and screenshot upload.",
            },
          },
          {
            title: "4. Check Status Under 'My Past Reports'",
            description:
              "Open the 'My Past Reports' tab inside the Report Issue window to see whether your ticket is OPEN, IN PROGRESS, or RESOLVED, along with administrator notes.",
            uiPills: [
              { label: "OPEN", variant: "status-amber" },
              { label: "IN PROGRESS", variant: "status-orange" },
              { label: "RESOLVED", variant: "status-green" },
            ],
            screenshot: {
              suggestedPath: "/docs/student/my-reports-history.png",
              caption:
                "Report history tab showing live resolution status and replies.",
            },
          },
        ],
      },
      {
        id: "s-05",
        slug: "student-password-recovery",
        role: "student",
        guideCode: "S-05",
        title: "Resetting a Forgotten Password",
        summary:
          "How to reset your password instantly with a 6-digit email verification code, or request Branch Manager approval if no email is linked.",
        readTimeMinutes: 3,
        lastUpdated: "November 2026",
        overview:
          "If your account has a linked email address, you can reset your password yourself in seconds using a 6-digit verification code. If you do not have an email linked or cannot check your inbox, your Branch Manager can approve the reset live.",
        steps: [
          {
            title: "1. Start a Password Reset",
            description:
              "On the login screen, tap 'Forgot password?'. Enter your Roll Number, Student ID, or registered Email address and tap 'Continue Password Reset'.",
            uiPills: [
              { label: "Forgot password?", variant: "utility" },
              { label: "Continue Password Reset", variant: "primary" },
            ],
            screenshot: {
              suggestedPath: "/docs/student/student-forgot-password-request.png",
              caption:
                "Forgot Password form accepting your Roll Number, Student ID, or Email.",
            },
          },
          {
            title: "2. Enter the 6-Digit Verification Code (If Email Is Linked)",
            description:
              "When an email is linked to your account, PaperGrade emails a 6-digit verification code valid for 10 minutes. Enter the 6 digits and tap 'Verify Code & Set Password'. If the email did not arrive after 60 seconds, tap 'Resend Code'.",
            uiPills: [
              { label: "Verify Code & Set Password", variant: "primary" },
              { label: "Resend Code", variant: "utility" },
            ],
            note: "Do not have access to your email inbox right now? Tap 'Request Manager Approval' on the verification screen to notify your Branch Manager instead.",
            noteType: "tip",
          },
          {
            title: "3. Branch Manager Approval (When No Email Is Available)",
            description:
              "If no email is linked to your student profile—or you selected 'Request Manager Approval'—your Branch Manager receives a live notification. Keep the waiting screen open; it automatically moves forward as soon as your manager taps 'Approve'.",
            uiPills: [{ label: "Request Manager Approval", variant: "utility" }],
            screenshot: {
              suggestedPath: "/docs/student/password-reset-wait.png",
              caption:
                "Waiting screen shown while your Branch Manager reviews your password reset request.",
            },
          },
          {
            title: "4. Create a New Password",
            description:
              "Once verified or approved, choose a new password (at least 8 characters), confirm it, and tap 'Save New Password & Sign In'.",
            uiPills: [
              { label: "Save New Password & Sign In", variant: "primary" },
            ],
          },
        ],
      },
      {
        id: "s-06",
        slug: "account-settings-and-drive-backup",
        role: "student",
        guideCode: "S-06",
        title: "Account Settings, Active Devices & Google Drive Backup",
        summary:
          "How to check your profile details, save graded answer scripts permanently to your personal Google Drive, monitor Drive space, and sign out of active devices.",
        readTimeMinutes: 4,
        lastUpdated: "November 2026",
        overview:
          "Published answer script PDFs remain hosted on PaperGrade for 15 days after results come out. Linking your personal Google Drive lets you automatically save a permanent copy of every graded paper neatly organized by subject—and manage all your signed-in devices from one place.",
        steps: [
          {
            title: "1. Open Account Settings",
            description:
              "Tap your Profile Avatar in the top-right corner (or open the menu and select 'Settings'). You can view and copy your Roll Number or User ID, link or unlink your Google account, and manage your password and signed-in sessions.",
            uiPills: [
              { label: "Change Password", variant: "utility" },
              { label: "Sign Out", variant: "danger" },
            ],
          },
          {
            title: "2. Connect Your Personal Google Drive",
            description:
              "Tap 'Link Gdrive' from your Student Portal header—or use the Google Drive section inside Account Settings—to grant permission. Once connected, your header shows a green 'Gdrive Linked' badge. PaperGrade only accesses the folders and papers it creates itself.",
            uiPills: [
              { label: "Link Gdrive", variant: "utility" },
              { label: "Gdrive Linked", variant: "status-green" },
            ],
            note: "You can check our Privacy Policy and Terms of Service links in the footer anytime for details on how Google Drive access works.",
            noteType: "tip",
          },
          {
            title: "3. Organized Subject Folders & Manual Backup",
            description:
              "PaperGrade automatically organizes your saved answer papers inside Google Drive under: My Drive / PaperGrade AI / Subject (for example: PaperGrade AI / Physics / Mid-Term.pdf). For any published exam not yet backed up, tap 'Backup to Drive' on the exam card or viewer; once saved, it turns into 'In Drive' so you can open the file directly.",
            uiPills: [
              { label: "Backup to Drive", variant: "utility" },
              { label: "In Drive", variant: "status-green" },
            ],
          },
          {
            title: "4. Storage Bar & Pause Auto-Sync",
            description:
              "Inside Account Settings, the Google Drive storage bar shows how much of your Drive space is used by PaperGrade papers compared to your other Drive files, with alerts if your Drive gets nearly full. You can click 'Pause Drive Auto-Sync' anytime without deleting papers already saved in your Drive.",
            uiPills: [{ label: "Pause Drive Auto-Sync", variant: "utility" }],
          },
          {
            title: "5. Manage Active Sessions & Signed-In Devices",
            description:
              "At the bottom of Account Settings, the 'Active Sessions & Devices' section lists every phone, tablet, or browser currently signed into your account (marking your current browser with a 'This Device' badge). Click 'Revoke' on any unrecognized or old device to sign it out immediately, or click 'Sign Out Other Devices' to keep only your current device signed in.",
            uiPills: [
              { label: "This Device", variant: "status-green" },
              { label: "Revoke", variant: "utility" },
              { label: "Sign Out Other Devices", variant: "danger" },
            ],
          },
        ],
      },
    ],
  },

  {
    id: "faculty",
    label: "Faculty & Branch Manager Manual",
    badge: "Teachers & Managers",
    description:
      "Batch rosters, Excel imports, exam setup, reviewing rubrics, running submission windows, manual paper grading, marks tables, and resolving appeals.",
    iconName: "Users",
    articles: [
      {
        id: "f-01",
        slug: "batches-roster-and-resets",
        role: "faculty",
        guideCode: "F-01",
        title: "Signing In, Batch Rosters, Excel Import & Student Resets",
        summary:
          "How Branch Managers and Teachers sign in, create student batches, import class rosters from Excel, and approve student password reset requests.",
        readTimeMinutes: 4,
        lastUpdated: "November 2026",
        overview:
          "Keeping your batch rosters up to date ensures students receive the right exam windows, notifications, and login access.",
        steps: [
          {
            title: "1. Staff Sign-In & Initial Password Setup",
            description:
              "Staff accounts are created by your Administrator. Sign in on the 'Faculty / Staff' tab with your email and password—or tap 'Continue with Google' if your Google account matches. If you were given a temporary starting password, choose 'One-Time Password Setup' in the sidebar or 'Set Personal Password' inside Account Settings.",
            uiPills: [
              { label: "Faculty / Staff", variant: "utility" },
              { label: "Sign In to Console", variant: "primary" },
            ],
            screenshot: {
              suggestedPath: "/docs/faculty/staff-initial-password-setup.png",
              caption:
                "Security panel where newly onboarded staff set their personal password.",
            },
            note: "If you ever forget your password, use 'Forgot password?' on the Faculty / Staff login tab for a 6-digit email code (or escalate to your Administrator if needed).",
            noteType: "tip",
          },
          {
            title: "2. Create Batches & Import Students from Excel",
            description:
              "Open 'Batches & Students' and click 'Create Batch' (for example: Class 12 JEE Morning). Inside any batch, use 'Add Student' for individual enrollments or click 'Import Excel' to upload an .xlsx or .xls spreadsheet. Only the Full Name column is required (Roll Numbers are assigned automatically in order; Email and Phone are optional). Click 'Process Import' to finish.",
            uiPills: [
              { label: "Create Batch", variant: "primary" },
              { label: "Import Excel", variant: "utility" },
              { label: "Process Import", variant: "primary" },
            ],
            note: "Including student email addresses in your Excel sheet enables self-service email password resets and result email/notification delivery.",
            noteType: "important",
            screenshot: {
              suggestedPath: "/docs/faculty/batch-roster-overview.png",
              caption:
                "Batches & Students workspace showing active batches, student rosters, and Import Excel action.",
            },
          },
          {
            title: "3. Approve Student Password Reset Requests",
            description:
              "Whenever a student without a linked email (or who asks for manager approval) submits a password reset, an alert banner appears on Batches & Students. Click 'Review & Approve' (or the 'Password Resets' button at the top), verify the student in person, and click 'Approve' or 'Reject'.",
            uiPills: [
              { label: "Review & Approve", variant: "primary" },
              { label: "Password Resets", variant: "utility" },
              { label: "Approve", variant: "primary" },
              { label: "Reject", variant: "danger" },
            ],
            screenshot: {
              suggestedPath: "/docs/faculty/approve-student-reset-modal.png",
              caption:
                "Pending Student Password Reset queue with Approve and Reject actions.",
            },
          },
        ],
      },
      {
        id: "f-02",
        slug: "exam-setup-and-materials",
        role: "faculty",
        guideCode: "F-02",
        title: "Creating Exams, Selecting Batches & Attaching Papers",
        summary:
          "How to set up a new exam for specific batches or an entire branch, attach Question Papers, and archive finished tests.",
        readTimeMinutes: 4,
        lastUpdated: "November 2026",
        overview:
          "Creating an examination defines the test name, subject, target batches, and Question Paper before you open student submission windows.",
        steps: [
          {
            title: "1. Enter Exam Details, Subject & Target Batches",
            description:
              "Go to 'Examinations' and click 'Create New Exam'. Enter the Exam Title, pick a Subject (or click 'Add Custom' to add a new subject), and choose 'Student Access & Batch Scope': either 'Whole Branch (All Batches)' or 'Select Batches (Single / Multiple)'. You can also add optional grading notes for special marking preferences—Total Marks will fill in automatically once the Official Answer Key and Rubric are ready.",
            uiPills: [
              { label: "Create New Exam", variant: "primary" },
              { label: "Add Custom", variant: "utility" },
            ],
          },
          {
            title: "2. Attach Master Question Paper & Governance Rules",
            description:
              "Attach the Question Paper PDF or images and click 'Create Exam'. To protect official grading standards, uploading or replacing Official Answer Keys ('Upload Key') and deleting published exams are restricted to the Root Administrator. Teachers and Branch Managers can open uploaded Question Papers and Answer Keys anytime using 'View PDF'.",
            uiPills: [
              { label: "Create Exam", variant: "primary" },
              { label: "View PDF", variant: "utility" },
              { label: "Upload Key", variant: "utility" },
            ],
            note: "When the Root Administrator uploads an Official Answer Key, PaperGrade confirms the upload first and then generates the draft grading rubric automatically.",
            noteType: "important",
            screenshot: {
              suggestedPath: "/docs/faculty/exam-lifecycle-card.png",
              caption:
                "Exam overview displaying Question Paper, Official Answer Key, and Grading Rubric cards.",
            },
          },
          {
            title: "3. Archiving & Restoring Finished Exams",
            description:
              "Use 'Archive' on older exams to keep your main Examinations list clean without losing any marks or records. You can switch to the 'Archived Exams' filter and click 'Restore' anytime.",
          },
        ],
      },
      {
        id: "f-03",
        slug: "ai-rubrics-and-best-of-n",
        role: "faculty",
        guideCode: "F-03",
        title: "Reviewing Grading Rubrics & Best-of-N Sections",
        summary:
          "How step-by-step marking schemes and optional Best-of-N question sections work inside the Rubric Matrix.",
        readTimeMinutes: 3,
        lastUpdated: "November 2026",
        overview:
          "Every evaluated exam uses a clear step-by-step Rubric Matrix so marks are awarded consistently across all students—including partial credit and optional choice sections.",
        steps: [
          {
            title: "1. How Draft Rubrics Are Created",
            description:
              "Once both the Question Paper and Official Answer Key are attached by the Root Administrator, PaperGrade automatically extracts every question, marking step, model answer, and total mark value into the Rubric Matrix (accessible via 'Configure Rubric ->' or 'View Rubric Matrix').",
            uiPills: [
              { label: "Configure Rubric ->", variant: "utility" },
              { label: "View Rubric Matrix", variant: "utility" },
            ],
            screenshot: {
              suggestedPath: "/docs/faculty/exam-rubric.png",
              caption:
                "Rubric Matrix displaying questions, step-by-step marks, and key concepts.",
            },
          },
          {
            title: "2. Best-of-N Optional Question Rules",
            description:
              "If an exam has optional sections (for example, 'Attempt any 3 of 5 questions in Section B'), PaperGrade highlights them with a 'Best of N Rule Active' banner. Even if a student answers extra questions, only their top-scoring eligible answers count toward the final total.",
            uiPills: [{ label: "Best of N Rule Active", variant: "status-green" }],
            screenshot: {
              suggestedPath: "/docs/faculty/exam-rubric-best3.png",
              caption:
                "Best-of-N section rule automatically selecting a student's highest-scoring questions.",
            },
          },
          {
            title: "3. Approved & Locked Rubrics Before Evaluation",
            description:
              "Before evaluation can begin, the Root Administrator reviews and locks the marking scheme using 'Approve & Lock Rubric' (or unlocks it with 'Unlock Rubric to Edit' if changes are needed before grading). Faculty and Branch Managers can inspect every question and step weight in the Rubric Matrix at any time.",
            uiPills: [
              { label: "Approve & Lock Rubric", variant: "primary" },
              { label: "Approved & Locked", variant: "status-green" },
              { label: "Unlock Rubric to Edit", variant: "utility" },
            ],
          },
        ],
      },
      {
        id: "f-04",
        slug: "submission-windows-and-extensions",
        role: "faculty",
        guideCode: "F-04",
        title: "Opening Live Submission Windows & Adding Extra Time",
        summary:
          "How to open timed student upload sessions, extend active windows by 15 minutes, close submissions, and reopen windows for absent or late students.",
        readTimeMinutes: 3,
        lastUpdated: "November 2026",
        overview:
          "Teachers and Branch Managers directly control when students are allowed to upload their answer sheets.",
        steps: [
          {
            title: "1. Open a Timed Submission Window",
            description:
              "Inside any exam page, click 'Open Window' on the Submission Window bar. Select a duration (from 5 up to 120 minutes), choose who can upload ('All Students (Replacements Allowed)' or 'Unsubmitted Students Only'), enter a short Session Note / Audit Reason, and submit.",
            uiPills: [
              { label: "Open Window", variant: "primary" },
              { label: "All Students (Replacements Allowed)", variant: "utility" },
              { label: "Unsubmitted Students Only", variant: "utility" },
            ],
            note: "Choose 'Unsubmitted Students Only' when reopening for absentees so already-submitted scripts cannot be overwritten.",
            noteType: "important",
          },
          {
            title: "2. Monitor Submissions, Extend by 15 Min, or Close Early",
            description:
              "While open, the banner shows 'Student Submission Window is LIVE' with a live MM:SS countdown. Click '+15 Min' anytime to give students 15 extra minutes, or click 'Close Window' to end uploads right away. Click 'Refresh' in the Submissions Grid and check 'Total Submissions' to watch papers come in.",
            uiPills: [
              { label: "Student Submission Window is LIVE", variant: "status-green" },
              { label: "15 Min", variant: "utility" },
              { label: "Close Window", variant: "danger" },
              { label: "Refresh", variant: "utility" },
            ],
            screenshot: {
              suggestedPath: "/docs/faculty/live-window.png",
              caption:
                "Live submission bar showing countdown timer, +15 Min extend button, and Close Window button.",
            },
          },
          {
            title: "3. Grace Period & Reopening Later",
            description:
              "Students still uploading when the countdown ends automatically receive a 2-minute grace period. To reopen submissions later, click 'Open Window' again and confirm via 'Confirm Reopening'.",
            uiPills: [{ label: "Confirm Reopening", variant: "primary" }],
          },
        ],
      },
      {
        id: "f-05",
        slug: "batch-evaluation-and-overrides",
        role: "faculty",
        guideCode: "F-05",
        title: "Overnight Evaluation, Reviewing Flagged Papers & Editing Marks",
        summary:
          "How overnight AI grading works after 8:00 PM IST, how to review NEEDS REVIEW papers, adjust answer regions on scanned sheets, and update marks.",
        readTimeMinutes: 5,
        lastUpdated: "November 2026",
        overview:
          "PaperGrade runs AI grading overnight so student exam sessions stay completely fast during the day. Once papers are evaluated, Teachers review flagged answers and fine-tune marks directly on each scanned script.",
        steps: [
          {
            title: "1. Daytime Uploads & Overnight Grading Schedule (8:00 PM IST)",
            description:
              "During daytime exam hours (before 8:00 PM IST), all student uploads are saved safely without running AI grading. After 8:00 PM IST—once the submission window is closed, Official Answer Key is uploaded, and the Rubric is 'Approved & Locked'—the Root Administrator triggers 'Start Evaluation' so papers are graded overnight for next-day or next-to-next-day review.",
            uiPills: [{ label: "Start Evaluation", variant: "primary" }],
            note: "Because evaluation runs overnight, teachers wake up to graded scripts ready for quick review before results are published.",
            noteType: "important",
            screenshot: {
              suggestedPath: "/docs/faculty/batch-eval.png",
              caption:
                "Evaluation status checklist and submission queue overview.",
            },
          },
          {
            title: "2. Filter Flagged Papers ('NEEDS REVIEW') & Bulk Unflag",
            description:
              "In the exam submissions list, filter by 'NEEDS REVIEW' (purple badge highlighting unclear handwriting or crossed-out work) or by score tier ('Distinction (>=75%)', 'Passing (40% - 74%)', 'Needs Attention (<40%)'). You can also select multiple checked rows and click 'Unflag (N)' once reviewed.",
            uiPills: [
              { label: "NEEDS REVIEW", variant: "utility" },
              { label: "Canvas ->", variant: "utility" },
              { label: "Unflag (N)", variant: "utility" },
            ],
          },
          {
            title: "3. Inspect Scanned Pages & Adjust Answer Highlights",
            description:
              "Click 'Canvas ->' beside any student to view their full handwritten answer sheets. Highlighted boxes mark where each question was answered. If an answer spans pages or part of a solution was missed, drag/resize any highlight box or click 'Add Box to Page' / 'Add Sheet' to include the missing area.",
            uiPills: [{ label: "Add Box to Page", variant: "utility" }],
          },
          {
            title: "4. Edit Step Marks, Request AI Second Opinion & Save",
            description:
              "Click any question on the paper to open its grading panel with 4 tabs: 'Handwriting & Crop' (zoomed handwritten image), 'Rubric & Uncertainty' (editable step marks), 'AI Second Opinion' (run a second AI check on tricky steps), and 'Audit Trail' (history of mark edits). Enter any updated score, add an optional Edit Reason, and click 'Save & Update Marks'.",
            uiPills: [
              { label: "AI Second Opinion", variant: "utility" },
              { label: "Audit Trail", variant: "utility" },
              { label: "Save & Update Marks", variant: "primary" },
            ],
          },
        ],
      },
      {
        id: "f-06",
        slug: "publishing-and-marks-matrix",
        role: "faculty",
        guideCode: "F-06",
        title: "Ranked Standings, Class Marks Matrix & Publishing Results",
        summary:
          "How to inspect class standings and question-wise marks matrices, export spreadsheets, and coordinate result publication.",
        readTimeMinutes: 3,
        lastUpdated: "November 2026",
        overview:
          "Once paper reviews are complete, use Marks & Inspection to review overall standings or question-by-question performance across the entire batch before results go live.",
        steps: [
          {
            title: "1. Ranked Standings & Class Marks Matrix",
            description:
              "Open 'Marks & Inspection' from the menu. By default you see 'Ranked Standings' sorted by rank and percentage. Switch to 'Marks Matrix' to inspect every student's individual score on every question side by side.",
            uiPills: [
              { label: "Ranked Standings", variant: "primary" },
              { label: "Marks Matrix", variant: "utility" },
            ],
            screenshot: {
              suggestedPath: "/docs/faculty/marks-matrix.png",
              caption:
                "Class Marks Matrix showing question-by-question marks across all students.",
            },
          },
          {
            title: "2. Publishing Results & Exporting Spreadsheets",
            description:
              "Clicking 'Publish Results' (which marks the exam as 'Finalized', alerts students, and saves copies to linked student Google Drives) is performed by the Root Administrator once faculty checks finish. Authorized staff can download results anytime from 'More Actions (...) -> Export Standings CSV' or 'Export Roster CSV'.",
            uiPills: [
              { label: "Publish Results", variant: "primary" },
              { label: "Finalized", variant: "status-green" },
              { label: "Export Standings CSV", variant: "utility" },
            ],
          },
        ],
      },
      {
        id: "f-07",
        slug: "resolving-revaluations",
        role: "faculty",
        guideCode: "F-07",
        title: "Resolving Student Revaluation Appeals",
        summary:
          "How to review student appeal requests on the Revaluation Desk, compare against the Answer Key, adjust page highlights if needed, and publish final decisions.",
        readTimeMinutes: 4,
        lastUpdated: "November 2026",
        overview:
          "The Revaluation Desk brings each student's written grievance, scanned handwriting, and official solution together so teachers can resolve appeals quickly and fairly.",
        steps: [
          {
            title: "1. Pick a Student Appeal from the Top Strip",
            description:
              "Open 'Revaluation Desk' from the menu. Pending student appeals appear first in the horizontal 'Student Papers with Appeals' strip at the top. Select a student card (and switch tabs like Appeal #1 if they challenged more than one question).",
            screenshot: {
              suggestedPath: "/docs/faculty/revaluation-desk.png",
              caption:
                "Revaluation Desk displaying student appeal selection alongside the paper viewer.",
            },
          },
          {
            title: "2. Review Highlighted Answer & Adjust Box if Needed",
            description:
              "Challenged areas are marked 'REVALUATION APPEAL' on the scanned sheet. Click the highlighted box to read the student's justification alongside the grading notes and model answer. If part of the student's work was outside the box, click 'Adjust Box on Canvas' to include it.",
            uiPills: [
              { label: "REVALUATION APPEAL", variant: "status-amber" },
              { label: "Adjust Box on Canvas", variant: "utility" },
            ],
          },
          {
            title: "3. Revise or Uphold Marks & Publish Decision",
            description:
              "Select 'Revise Marks' (and enter the new score) or 'Uphold Original Score', add clear Reviewer Notes explaining your decision, and click 'Finalize & Publish Decision'. The student is notified right away and their appeal status updates automatically.",
            uiPills: [
              { label: "Revise Marks", variant: "primary" },
              { label: "Uphold Original Score", variant: "utility" },
              { label: "Finalize & Publish Decision", variant: "primary" },
            ],
          },
        ],
      },
    ],
  },

  {
    id: "director",
    label: "Director & Root Admin Manual",
    badge: "Leadership & Admin",
    description:
      "Multi-branch Director oversight, campus & staff setup, 15-day paper retention, overnight evaluation governance, and support reports.",
    iconName: "Building2",
    articles: [
      {
        id: "d-01",
        slug: "multi-branch-oversight",
        role: "director",
        guideCode: "D-01",
        title: "Multi-Branch Academic Oversight (Institute Directors)",
        summary:
          "How Institute Directors switch across all branches in their institute to monitor batches, exams, student performance tiers, and appeal resolution.",
        readTimeMinutes: 3,
        lastUpdated: "November 2026",
        overview:
          "Institute Directors can inspect and oversee every physical campus under their institute from one account—without waiting for separate branch reports.",
        steps: [
          {
            title: "1. Switch Branches via the Operational Branch Selector",
            description:
              "Use the 'Operational Branch' selector in the top header to switch between any branch in your institute. Batches, Examinations, Marks & Inspection, and Revaluation Desk immediately show data for the selected campus.",
            uiPills: [{ label: "Operational Branch", variant: "utility" }],
            screenshot: {
              suggestedPath: "/docs/director/branch-switcher-roster.png",
              caption:
                "Operational Branch selector in the header for instant switching across institute branches.",
            },
          },
          {
            title: "2. Monitor Score Tiers & Revaluation Turnaround",
            description:
              "Inside each exam and standings view, filter results across 'Distinction (>=75%)', 'Passing (40% - 74%)', and 'Needs Attention (<40%)', and check the Revaluation Desk to ensure student appeals are resolved on time across branches.",
            note: "System-wide administration (setting up new branches/staff, uploading Official Answer Keys, locking rubrics, starting overnight evaluation, and publishing final results) is managed by the Root Administrator.",
            noteType: "important",
          },
        ],
      },
      {
        id: "d-02",
        slug: "staff-management-and-resets",
        role: "director",
        guideCode: "D-02",
        title: "Managing Institutes, Branches & Staff Accounts (Root Admin)",
        summary:
          "How Root Administrators onboard coaching institutes, add physical branches and subjects, assign Directors and Branch Managers, and approve escalated staff password resets.",
        readTimeMinutes: 4,
        lastUpdated: "November 2026",
        overview:
          "Institutes, campuses, subject lists, and leadership accounts are centrally created and maintained under Tenancy Management by the Root Administrator.",
        steps: [
          {
            title: "1. Add Institutes, Branches & Subjects",
            description:
              "Open Tenancy Management from the sidebar. Click 'Register Coaching Institute' to create an organization, then use 'Add Physical Branch' and 'Add Subject' on its card to configure its branches and curriculum subjects.",
            uiPills: [
              { label: "Register Coaching Institute", variant: "primary" },
              { label: "Add Physical Branch", variant: "utility" },
              { label: "Add Subject", variant: "utility" },
            ],
          },
          {
            title: "2. Appoint Directors & Assign Branch Managers",
            description:
              "Click 'Appoint Director' on an Institute card to grant multi-branch oversight, or click 'Assign Manager' on any Branch card to create or update campus Branch Manager accounts.",
            uiPills: [
              { label: "Appoint Director", variant: "primary" },
              { label: "Assign Manager", variant: "utility" },
            ],
            note: "Staff members can sign in with their assigned password or with Google whenever their email matches.",
            noteType: "tip",
          },
          {
            title: "3. Resolve Escalated Staff Password Resets",
            description:
              "Staff members reset forgotten passwords first through a 6-digit email verification code. When a staff member escalates a reset request, open 'Staff Password Resets' inside Tenancy Management and click 'Approve Reset' or 'Reject' after verifying their identity.",
            uiPills: [
              { label: "Staff Password Resets", variant: "utility" },
              { label: "Approve Reset", variant: "primary" },
              { label: "Reject", variant: "danger" },
            ],
            screenshot: {
              suggestedPath: "/docs/director/staff-reset-awaiting-director.png",
              caption:
                "Staff password reset waiting screen when escalated to Administrator review.",
            },
          },
        ],
      },
      {
        id: "d-03",
        slug: "paper-retention-and-records",
        role: "director",
        guideCode: "D-03",
        title: "15-Day Paper Retention, Permanent Transcripts & Drive Backup",
        summary:
          "How long scanned answer sheet PDFs remain available on PaperGrade, why marks remain permanent, and how students keep lifelong PDF copies in Google Drive.",
        readTimeMinutes: 3,
        lastUpdated: "November 2026",
        overview:
          "PaperGrade keeps active scanned PDFs online for 15 days after results are published while keeping all academic scores permanent—and gives students a one-click option to archive full PDFs forever in their own Google Drive.",
        steps: [
          {
            title: "1. 15-Day Scanned Paper Window",
            description:
              "Full-resolution answer sheet PDFs remain downloadable from PaperGrade for 15 days after result publication (indicated on exam cards by badges like '15d retention' before changing to 'PDF Archived').",
            uiPills: [
              { label: "15d retention", variant: "status-green" },
              { label: "PDF Archived", variant: "utility" },
            ],
            screenshot: {
              suggestedPath: "/docs/student/past-exams-retention.png",
              caption:
                "Exam cards showing the 15-day scanned document retention badge.",
            },
          },
          {
            title: "2. Permanent Marks Ledger & Student Google Drive Copies",
            description:
              "All official academic records—total scores, question-level marks, grading feedback, class ranks, and revaluation decisions—are preserved permanently and remain searchable under Marks & Inspection. Students who link Google Drive in Account Settings also keep their full graded PDFs permanently inside 'My Drive / PaperGrade AI / Subject' even after 15 days.",
            note: "Encourage students to connect their personal Google Drive early so every published answer sheet backs up automatically.",
            noteType: "important",
          },
        ],
      },
      {
        id: "d-04",
        slug: "platform-governance-and-operations",
        role: "director",
        guideCode: "D-04",
        title: "Overnight Evaluation, Result Publishing & Support Desk (Root Admin)",
        summary:
          "Root Administrator workflow for monitoring readiness, running overnight grading after 8:00 PM IST, publishing results, and resolving user-reported issues.",
        readTimeMinutes: 4,
        lastUpdated: "November 2026",
        overview:
          "Root Administrators oversee overall readiness, control final Official Answer Key and Publish steps, run overnight evaluations after daytime exams finish, and manage incoming support tickets.",
        steps: [
          {
            title: "1. Overview Checklist, Overnight Grading (>= 8:00 PM IST) & Publishing",
            description:
              "Check 'Overview' to verify exam readiness. Daytime exam hours before 8:00 PM IST are kept strictly dedicated to smooth student submissions. From 8:00 PM IST onward—once submissions are closed, the Official Answer Key is uploaded, and the Rubric is 'Approved & Locked'—click 'Start Evaluation' on the exam page to process scripts overnight, then click 'Publish Results' once faculty verification is done.",
            uiPills: [
              { label: "Start Evaluation", variant: "primary" },
              { label: "Publish Results", variant: "primary" },
            ],
            note: "Standard result turnaround is next day or next-to-next day after overnight evaluation and teacher review.",
            noteType: "important",
          },
          {
            title: "2. Resolving Technical Support Tickets & Monitoring Usage",
            description:
              "Open 'Technical Reports' from the sidebar to review bug reports and screenshots submitted by students or staff, updating tickets across OPEN, IN PROGRESS, and RESOLVED states with helpful responses. Visit 'Usage & Analytics' anytime to inspect grading activity and configure daily limits ('Save Limits').",
            uiPills: [
              { label: "Save Limits", variant: "primary" },
              { label: "OPEN", variant: "status-amber" },
              { label: "IN PROGRESS", variant: "status-orange" },
              { label: "RESOLVED", variant: "status-green" },
            ],
          },
        ],
      },
    ],
  },
];

export function getArticleBySlug(
  role: RoleId,
  slug: string
): DocArticle | undefined {
  const track = HELP_ROLE_TRACKS.find((t) => t.id === role);
  if (!track) return undefined;
  return track.articles.find((a) => a.slug === slug);
}

export function getAllArticles(): DocArticle[] {
  return HELP_ROLE_TRACKS.flatMap((t) => t.articles);
}

export function getAdjacentArticles(
  role: RoleId,
  slug: string
): { prev?: DocArticle; next?: DocArticle } {
  const track = HELP_ROLE_TRACKS.find((t) => t.id === role);
  if (!track) return {};
  const idx = track.articles.findIndex((a) => a.slug === slug);
  if (idx === -1) return {};
  return {
    prev: idx > 0 ? track.articles[idx - 1] : undefined,
    next:
      idx < track.articles.length - 1 ? track.articles[idx + 1] : undefined,
  };
}

export function searchHelpDocs(query: string): DocArticle[] {
  if (!query.trim()) return [];
  const clean = query.toLowerCase().trim();
  return getAllArticles().filter(
    (a) =>
      a.title.toLowerCase().includes(clean) ||
      a.guideCode.toLowerCase().includes(clean) ||
      a.summary.toLowerCase().includes(clean) ||
      a.overview.toLowerCase().includes(clean) ||
      a.steps.some(
        (s) =>
          s.title.toLowerCase().includes(clean) ||
          s.description.toLowerCase().includes(clean)
      )
  );
}
