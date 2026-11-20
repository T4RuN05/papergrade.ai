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
  uiPills?: Array<{ label: string; variant?: "primary" | "utility" | "danger" | "status-green" | "status-amber" | "status-orange" | "field" }>;
  note?: string;
  noteType?: "tip" | "important" | "warning";
  screenshot?: ScreenshotSlot;
}

export interface DocArticle {
  id: string;
  slug: string;
  role: RoleId;
  guideCode: string; // e.g. "S-01", "F-04"
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
    description: "App installation, scanning with camera, uploading answer sheets, reading marked papers, standings, and appeals.",
    iconName: "GraduationCap",
    articles: [
      {
        id: "s-01",
        slug: "pwa-and-account-claim",
        role: "student",
        guideCode: "S-01",
        title: "Installing the App on Your Phone & First-Time Account Setup",
        summary: "How to add PaperGrade to your home screen for full-screen camera use and activate your account using your Roll Number.",
        readTimeMinutes: 3,
        lastUpdated: "November 2026",
        screenshotSlot: {
          suggestedPath: "/docs/student/welcome-portal.png",
          caption: "Figure 1.1: PaperGrade mobile portal landing page with Student Portal and Claim Student ID options.",
          pins: [
            { number: 1, label: "PaperGrade logo & header bar" },
            { number: 2, label: "Student Portal sign-in button" },
            { number: 3, label: "Claim Student ID activation button" },
          ],
        },
        overview: "PaperGrade is designed as an installable app for your phone. Installing it gives you quick one-tap access from your home screen, prevents accidental browser tab closures during exams, and enables full-screen document scanning with your camera.",
        steps: [
          {
            title: "1. Install on iPhone or iPad (Safari)",
            description: "Open the exam portal link in Safari. Tap the Share icon (the square with an arrow pointing upward at the bottom of the screen). Scroll down the share sheet and tap 'Add to Home Screen'. Tap 'Add' in the top right corner. The PaperGrade icon will now appear on your home screen.",
            note: "Always use Safari on iOS for the initial installation. Chrome on iOS does not support full home-screen app mode.",
            noteType: "tip",
            screenshot: {
              suggestedPath: "/docs/student/ios-install-banner.png",
              caption: "In-app install banner on iOS Safari with step-by-step instructions to Add to Home Screen.",
              pins: [
                { number: 1, label: "Install PaperGrade on iPhone alert banner" },
                { number: 2, label: "Step 1: Tap Safari Share button" },
                { number: 3, label: "Step 2: Tap Add to Home Screen" },
                { number: 4, label: "Step 3: Tap Add in top-right corner" },
              ],
            },
          },
          {
            title: "2. Install on Android (Chrome)",
            description: "Open the portal link in Google Chrome. Tap the 'Install App' banner that appears at the top or bottom of the screen. If you do not see the banner, tap the three dots in the top-right corner and select 'Install app' (or 'Add to Home screen'). Confirm by tapping 'Install'.",
            noteType: "tip",
          },
          {
            title: "3. Open the App & Choose 'Claim Account'",
            description: "Launch PaperGrade from your home screen. At the top of the sign-in box, you will see three tabs: [ Student ], [ Faculty / Staff ], and [ Claim Account ]. Tap [ Claim Account ].",
            uiPills: [{ label: "Claim Account", variant: "utility" }],
            screenshot: {
              suggestedPath: "/docs/student/account-claim.png",
              caption: "First-time account claim tab with Roll Number and password setup.",
              pins: [
                { number: 1, label: "Claim Account navigation tab" },
                { number: 2, label: "Institute Roll Number input box" },
                { number: 3, label: "Password creation (min 8 characters)" },
              ],
            },
          },
          {
            title: "4. Enter Your Roll Number & Set Password",
            description: "Type your official Roll Number provided by your institute (for example: C25-BVI-001) in the < Institute Roll Number > box. Enter a secure password (at least 8 characters) in < Create Password >, and repeat it in < Confirm Password >.",
            uiPills: [
              { label: "Institute Roll Number", variant: "field" },
              { label: "Create Password", variant: "field" },
            ],
          },
          {
            title: "5. Activate & Sign In",
            description: "Tap [ Claim Account & Sign In ]. You will see a green confirmation saying 'Account Claimed Successfully!' and be automatically logged into your Student Portal dashboard. For future logins, use the regular Student Sign-In tab with your roll number and password.",
            uiPills: [{ label: "Claim Account & Sign In", variant: "primary" }],
            note: "Remember your password. For all future sign-ins, use the [ Student ] tab with your Roll Number and password.",
            noteType: "important",
            screenshot: {
              suggestedPath: "/docs/student/account-claim-success.png",
              caption: "Account Claimed Successfully confirmation screen confirming your account is now active.",
              pins: [
                { number: 1, label: "Account Claimed Successfully notification" },
                { number: 2, label: "Active status message" },
              ],
            },
          },
        ],
        faq: [
          {
            question: "What if the app says 'Roll number not found or already claimed'?",
            answer: "Check that you typed your roll number with correct dashes and capital letters. If your account was already activated earlier, simply switch to the [ Student ] tab and sign in. If you forgot your password, use the 'Forgot password?' link.",
          },
        ],
      },
      {
        id: "s-02",
        slug: "taking-exams-and-scanning",
        role: "student",
        guideCode: "S-02",
        title: "Taking Exams, Camera Scanning & Replacing Answer Sheets",
        summary: "Step-by-step instructions for clicking clean photos of handwritten pages, rearranging pages, and uploading your answer sheet.",
        readTimeMinutes: 5,
        lastUpdated: "November 2026",
        screenshotSlot: {
          suggestedPath: "/docs/student/active-exam-camera.gif",
          caption: "Figure 1.2: Animated demonstration of the live exam submission screen, camera scanning, and page reordering.",
          pins: [
            { number: 1, label: "Live submission countdown timer" },
            { number: 2, label: "Scan Page (Camera) button" },
            { number: 3, label: "Page thumbnails with up/down arrows" },
            { number: 4, label: "Replace Answer Sheet button" },
          ],
        },
        overview: "When an examination is in progress, your Student Portal shows an active exam card with a live countdown timer. You can take photos of your handwritten sheets one by one directly inside the app, check thumbnail order, and submit with a single tap.",
        steps: [
          {
            title: "1. Locate the Active Exam Card",
            description: "Sign into PaperGrade on your phone. Under 'Active Examinations', you will see your scheduled exam marked with a pulsing green badge: 'ACTIVE NOW'. A real-time countdown timer shows exactly how many minutes remain before the submission window closes.",
          },
          {
            title: "2. Click Photos with the In-App Camera",
            description: "Tap [ Scan Page (Camera) ]. Your phone camera opens inside PaperGrade. Hold your phone flat over page 1 in good room light, make sure all four corners are visible, and tap the shutter button. The page appears as thumbnail #1. Repeat for page 2, page 3, up to page 15.",
            uiPills: [{ label: "Scan Page (Camera)", variant: "primary" }],
            note: "Place your answer sheet on a flat table under bright light. Avoid casting hand or phone shadows over your handwriting.",
            noteType: "tip",
            screenshot: {
              suggestedPath: "/docs/student/active-exam-camera.gif",
              caption: "Live submission countdown timer, in-app camera scanning, and page thumbnail strip.",
              pins: [
                { number: 1, label: "Live submission countdown timer" },
                { number: 2, label: "Scan Next Page (Camera) button" },
                { number: 3, label: "Scanned page thumbnails list" },
              ],
            },
          },
          {
            title: "3. Choose Photos or PDF from Gallery",
            description: "If you already took photos using your standard camera app or have a scanned PDF document, tap [ Choose Photos / PDF ] to select the images directly from your photo library.",
            uiPills: [{ label: "Choose Photos / PDF", variant: "utility" }],
          },
          {
            title: "4. Rearrange & Delete Pages",
            description: "Review the thumbnail strip below the camera button. Each page shows its order number (Page 1, Page 2...). Tap the [ ↑ ] (Up) and [ ↓ ] (Down) arrows to re-order pages if they were scanned out of sequence. Tap the [ Trash ] icon to remove any blurred page and retake it.",
            uiPills: [
              { label: "↑ Move Up", variant: "utility" },
              { label: "↓ Move Down", variant: "utility" },
              { label: "Delete Page", variant: "danger" },
            ],
            screenshot: {
              suggestedPath: "/docs/student/page-rearranging.gif",
              caption: "Animated demonstration of rearranging handwritten pages using up (↑) and down (↓) controls.",
              pins: [
                { number: 1, label: "Page order numbers (Page 1, Page 2, Page 3)" },
                { number: 2, label: "Up arrow (↑) to move page earlier" },
                { number: 3, label: "Down arrow (↓) to move page later" },
                { number: 4, label: "Trash icon to delete and retake blurred page" },
              ],
            },
          },
          {
            title: "5. Submit Your Answer Sheet",
            description: "When all pages are in order, tap [ Submit Answer Sheet (N Pages) ]. The app automatically combines your photos into one clear document on your phone and uploads it securely to the cloud. You will see a green checkmark saying 'Submission Received Successfully' with your official timestamp.",
            uiPills: [{ label: "Submit Answer Sheet", variant: "primary" }],
            note: "Do not close the app while the circular upload progress bar is moving. It takes only a few seconds on a normal 4G/5G or Wi-Fi connection.",
            noteType: "important",
          },
          {
            title: "6. Replacing Your Answer Sheet Before the Deadline",
            description: "If you realize you missed a page or submitted the wrong sheet, do not worry: as long as the exam window countdown timer is still running, you can tap [ Replace Answer Sheet ]. This opens the scanner again. Scan your corrected pages and tap [ Confirm Replacement ]. The newest submission replaces the previous one with an updated audit timestamp.",
            uiPills: [{ label: "Replace Answer Sheet", variant: "utility" }],
          },
        ],
        faq: [
          {
            question: "Why does the app say 'Results will be published tomorrow' instead of showing instant marks?",
            answer: "PaperGrade follows an overnight batch evaluation policy. During the daytime exam hours, server capacity is 100% reserved so that uploading answer sheets is smooth and lag-free for every student. AI evaluation runs overnight after classes finish.",
          },
          {
            question: "What happens if my phone battery dies or internet drops while uploading?",
            answer: "If the network disconnects, the app safely alerts you. Simply reconnect to Wi-Fi or mobile data and tap Submit again before the window timer reaches zero.",
          },
        ],
      },
      {
        id: "s-03",
        slug: "results-rankings-and-keys",
        role: "student",
        guideCode: "S-03",
        title: "Checking Evaluated Papers, Scores, Class Rankings & Master Keys",
        summary: "How to inspect teacher markings on your handwritten paper, view question-by-question scoring, check class standings, and download master question papers.",
        readTimeMinutes: 4,
        lastUpdated: "November 2026",
        screenshotSlot: {
          suggestedPath: "/docs/student/graded-viewer.png",
          caption: "Figure 1.3: Graded paper viewer showing official marked score, page navigator, and download options.",
          pins: [
            { number: 1, label: "Official awarded score & percentage badge" },
            { number: 2, label: "Question Paper & Key quick access button" },
            { number: 3, label: "Download Graded Answer Sheet action" },
            { number: 4, label: "Interactive handwritten page viewer" },
          ],
        },
        overview: "Once your institute officially publishes exam results, you can review your marked paper with detailed step marks, compare your performance on the trajectory chart, and see your rank in the batch.",
        steps: [
          {
            title: "1. Check Your Dashboard Summary & Past Exams",
            description: "At the top of your Student Portal, summary tiles show 'Submitted', 'Published', 'Average', and 'Under Review'. Switch to the 'Past Exams' tab to view all completed papers, official scores, and 15-day storage retention badges.",
            screenshot: {
              suggestedPath: "/docs/student/past-exams-retention.png",
              caption: "Past exam submissions list showing published scores and the 15-day paper retention badge.",
              pins: [
                { number: 1, label: "Results Published status pill" },
                { number: 2, label: "15d retention storage badge" },
                { number: 3, label: "Subject and awarded score (e.g. 10.5 / 25m)" },
              ],
            },
          },
          {
            title: "2. Track Your Progress with the Marks Trajectory Graph",
            description: "Scroll down to the interactive performance graph. Tap [ All Subjects ], [ Physics ], [ Chemistry ], or [ Maths ] to see how your scores are trending in each subject over the school term. Tap any point on the curve to see the exam title, date, score, and whether marks were revised.",
            uiPills: [
              { label: "All Subjects", variant: "utility" },
              { label: "Physics", variant: "utility" },
              { label: "Chemistry", variant: "utility" },
            ],
            screenshot: {
              suggestedPath: "/docs/student/student-dashboard-trajectory.png",
              caption: "Cumulative Marks Trajectory graph with subject filters and overall percentage.",
              pins: [
                { number: 1, label: "Cumulative percentage score" },
                { number: 2, label: "Subject filter pills (All, Physics, Chemistry)" },
                { number: 3, label: "Historical trajectory trend curve" },
              ],
            },
          },
          {
            title: "3. Open Your Exam Card Action Menu",
            description: "Tap on any completed exam card to expand its action buttons: [ View Summary ], [ Class Standings ], [ QP & Key ], [ Download PDF ], and [ Request Revaluation ].",
            uiPills: [
              { label: "View Summary", variant: "utility" },
              { label: "Class Standings", variant: "utility" },
              { label: "QP & Key", variant: "utility" },
              { label: "Download PDF", variant: "utility" },
            ],
            screenshot: {
              suggestedPath: "/docs/student/exam-card-actions.png",
              caption: "Expanded exam card showing all student actions and quick links.",
              pins: [
                { number: 1, label: "View Summary breakdown" },
                { number: 2, label: "Class Standings leaderboard" },
                { number: 3, label: "QP & Key document viewer" },
                { number: 4, label: "Download PDF button" },
              ],
            },
          },
          {
            title: "4. Read Step Marks & Question Deductions",
            description: "Tap [ View Summary ] or open the paper viewer. Look for red and green badges next to your answers showing marks earned for formulas, substitutions, and answers. At the top right of each page, a stamp shows the total marks for that page. Tap on any question box to open the Question Breakdown details: read where points were awarded or deducted, and review the official model answer.",
            screenshot: {
              suggestedPath: "/docs/student/evaluation-breakdown.png",
              caption: "Step-by-step Evaluation Breakdown showing question prompts, awarded marks, and criteria.",
              pins: [
                { number: 1, label: "Total Awarded marks header (e.g. 17.5 / 25m)" },
                { number: 2, label: "Class Standings and Annotated PDF links" },
                { number: 3, label: "Question prompt and criteria breakdown dropdown" },
              ],
            },
          },
          {
            title: "5. Inspect Question Criteria & AI Transcription",
            description: "Tap into any specific question to see the AI Vision transcription of your handwritten solution alongside the official step-by-step rubric criteria and remarks.",
            screenshot: {
              suggestedPath: "/docs/student/question-score-criteria-ai.png",
              caption: "Question review modal showing AI Vision transcribed student steps and rubric criteria.",
              pins: [
                { number: 1, label: "100% Score feedback & remarks" },
                { number: 2, label: "Step criteria breakdown (C1, C2) with awarded points" },
                { number: 3, label: "Transcribed student handwriting via AI vision" },
              ],
            },
          },
          {
            title: "6. Check Class Standings & Merit Rankings",
            description: "In the graded paper viewer (or on the past exam card), tap [ Class Standings ] (Trophy icon). The rankings table shows top performers with Gold, Silver, and Bronze trophies. The list automatically highlights your roll number in blue so you can see where you stand in your batch.",
            uiPills: [{ label: "Class Standings", variant: "utility" }],
            screenshot: {
              suggestedPath: "/docs/student/class-standings-modal.png",
              caption: "Class Standings modal displaying the batch merit leaderboard and student position.",
              pins: [
                { number: 1, label: "Standing leaderboard header" },
                { number: 2, label: "Top merit ranks (#1, #2, #3)" },
                { number: 3, label: "Student score comparison" },
              ],
            },
          },
          {
            title: "7. View & Download Question Papers & Answer Keys",
            description: "In the top bar of your graded paper or on the exam card, tap [ QP & Key ]. A viewer opens with two tabs: [ Question Paper ] and [ Answer Key ]. You can zoom in and pan around diagrams, or tap [ Download Document ] to save the master PDF to your device.",
            uiPills: [
              { label: "Question Paper", variant: "utility" },
              { label: "Answer Key", variant: "utility" },
              { label: "Download Document", variant: "primary" },
            ],
            screenshot: {
              suggestedPath: "/docs/student/master-qp-answer-key-viewer.png",
              caption: "Master Question Paper and Answer Key in-app document viewer.",
              pins: [
                { number: 1, label: "Exam title and page counter (e.g. Page 1 / 14)" },
                { number: 2, label: "Final Answer Key document with step marks" },
              ],
            },
          },
        ],
      },
      {
        id: "s-04",
        slug: "revaluations-and-bug-reports",
        role: "student",
        guideCode: "S-04",
        title: "Filing Revaluation Appeals & Reporting Technical Glitches",
        summary: "How to challenge a question mark with academic justification, and how to report app bugs or upload issues with screenshots.",
        readTimeMinutes: 3,
        lastUpdated: "November 2026",
        screenshotSlot: {
          suggestedPath: "/docs/student/report-issue-modal.png",
          caption: "Figure 1.4: Technical Support & Issue Report form with category selection and screenshot attachment.",
          pins: [
            { number: 1, label: "Issue Category dropdown" },
            { number: 2, label: "Subject / Summary title field" },
            { number: 3, label: "Detailed Description text box (up to 1,000 characters)" },
            { number: 4, label: "Attach Screenshots slot (up to 3 images)" },
          ],
        },
        overview: "PaperGrade gives students a formal, transparent channel to appeal marking discrepancies and report technical issues directly to teachers and technical administrators.",
        steps: [
          {
            title: "1. How to File a Revaluation Appeal",
            description: "Open your graded paper or tap [ Request Revaluation ] on your past exam card. Tap on the question you wish to challenge. At the bottom of the question review dialog, tap [ Submit Appeal for Question ].",
            uiPills: [{ label: "Submit Appeal for Question", variant: "primary" }],
            screenshot: {
              suggestedPath: "/docs/student/revaluation-modal.png",
              caption: "Question review dialog with the Submit Appeal for Question action button.",
              pins: [
                { number: 1, label: "Official model solution display" },
                { number: 2, label: "Submit Appeal for Question button" },
              ],
            },
          },
          {
            title: "2. Write Your Academic Justification",
            description: "In the justification box, write a clear, academic reason (e.g., 'Formula in Step 2 matches Maharashtra State Board Textbook Page 54. Requesting review of partial mark'). Tap [ Submit Appeal ].",
            note: "Be respectful and specific. Appeals with clear textbook or formula references are reviewed faster by faculty.",
            noteType: "tip",
          },
          {
            title: "3. Tracking Your Appeal",
            description: "Go to 'Revaluations & Appeals' in your navigation menu. You can track real-time status across all your examination appeals: '● Revaluation Pending' (orange) or '● Marks Revised' (gold). When revised, your paper is automatically re-stamped with the new score.",
            screenshot: {
              suggestedPath: "/docs/student/my-revaluation-appeals.png",
              caption: "My Revaluation Appeals dashboard tracking real-time status across exams.",
              pins: [
                { number: 1, label: "My Revaluation Appeals header" },
                { number: 2, label: "Search by exam or subject bar" },
                { number: 3, label: "Appeal status cards & step review tracking" },
              ],
            },
          },
          {
            title: "4. How to Report a Technical Bug or App Glitch",
            description: "If you experience an upload error, layout glitch, or screen freeze, tap [ Report Issue ] at the top of your student dashboard or inside the Student Support card.",
            uiPills: [{ label: "Report Issue", variant: "utility" }],
          },
          {
            title: "5. Choose Category & Attach Screenshots",
            description: "Select the issue category: 'PDF Upload / Submission Problem', 'Marks & Evaluation Display Issue', 'Login & Authentication Problem', or 'Page Visual Glitch'. Describe what happened and tap [ Click to attach screenshot ] to attach up to 3 photos of the error. Tap [ Submit Report ].",
            note: "The app automatically includes your device model, browser version, and page URL so engineers can resolve the issue quickly.",
            noteType: "tip",
            screenshot: {
              suggestedPath: "/docs/student/report-issue-modal.png",
              caption: "Technical Support & Issue Report submission dialog.",
              pins: [
                { number: 1, label: "Category selector (e.g. PDF Upload / Submission Problem)" },
                { number: 2, label: "Subject summary and detailed explanation" },
                { number: 3, label: "Screenshot file uploader (up to 3 files, max 500KB each)" },
              ],
            },
          },
          {
            title: "6. Check Status in 'My Reports'",
            description: "Switch to the [ My Reports ] tab anytime to see your ticket status (Pending, Investigating, Resolved) and read comments from technical staff.",
            uiPills: [{ label: "My Reports", variant: "utility" }],
            screenshot: {
              suggestedPath: "/docs/student/my-reports-history.png",
              caption: "My Reports history tab showing resolved status and staff feedback.",
              pins: [
                { number: 1, label: "Resolved badge pill" },
                { number: 2, label: "Issue category and timestamp" },
                { number: 3, label: "Summary of problem report" },
              ],
            },
          },
          {
            title: "7. Real-Time Resolution Alerts",
            description: "When an engineer or manager resolves your technical ticket, an in-app alert notifies you immediately with a direct link to view details.",
            screenshot: {
              suggestedPath: "/docs/student/issue-resolved-notification.png",
              caption: "In-app resolution alert notification.",
              pins: [
                { number: 1, label: "Technical Issue Resolved alert banner" },
                { number: 2, label: "View Details and Mark read actions" },
              ],
            },
          },
        ],
      },
      {
        id: "s-05",
        slug: "student-password-recovery",
        role: "student",
        guideCode: "S-05",
        title: "Student Password Recovery (Forgot Password Workflow)",
        summary: "How to reset your student password securely through live Branch Manager approval without losing account data.",
        readTimeMinutes: 3,
        lastUpdated: "November 2026",
        screenshotSlot: {
          suggestedPath: "/docs/student/password-reset-wait.png",
          caption: "Figure 1.5: Password reset request screen and live manager approval waiting radar.",
          pins: [
            { number: 1, label: "Live awaiting authorization radar" },
            { number: 2, label: "Do Not Refresh or Leave notice" },
            { number: 3, label: "Automatic unlock notification" },
          ],
        },
        overview: "To prevent unauthorized password resets or account hijacking, student password resets are authorized in real time by your institute's Branch Manager.",
        steps: [
          {
            title: "1. Start Password Reset",
            description: "On the sign-in screen, make sure the [ Student ] tab is selected. Under the password field, tap 'Forgot password?'.",
            uiPills: [{ label: "Student", variant: "utility" }],
          },
          {
            title: "2. Enter Your Student Roll Number",
            description: "In the < Student Roll Number or Email > box, enter your official roll number (e.g. TEST_INST-TEST_BVI-001). Tap [ Request Reset Approval ].",
            uiPills: [
              { label: "Student Roll Number or Email", variant: "field" },
              { label: "Request Reset Approval", variant: "primary" },
            ],
            screenshot: {
              suggestedPath: "/docs/student/student-forgot-password-request.png",
              caption: "Reset Student Password request form dispatched to your Branch Manager.",
              pins: [
                { number: 1, label: "Reset Student Password header" },
                { number: 2, label: "Student Roll Number or Email input" },
                { number: 3, label: "Back to Sign In navigation link" },
              ],
            },
          },
          {
            title: "3. Keep the Waiting Screen Open",
            description: "Your screen will transition to: 'Awaiting Branch Manager Approval' with an active radar animation. A real-time request is sent to your Branch Manager's computer.",
            note: "DO NOT refresh or close this browser tab. Keep it open while awaiting approval.",
            noteType: "warning",
            screenshot: {
              suggestedPath: "/docs/student/password-reset-wait.png",
              caption: "Live Manager Authorization screen waiting for Branch Manager approval.",
              pins: [
                { number: 1, label: "Awaiting Branch Manager Approval title" },
                { number: 2, label: "Do Not Refresh or Leave security warning" },
                { number: 3, label: "Real-time socket connection indicator" },
              ],
            },
          },
          {
            title: "4. Instant Unlock & Setting New Password",
            description: "As soon as your Branch Manager clicks approve, your screen automatically changes to 'Set New Password' without needing any page reload. Enter your new password, confirm it, and tap [ Save New Password & Sign In ]. You are signed in immediately.",
          },
        ],
      },
    ],
  },
  {
    id: "faculty",
    label: "Faculty & Branch Manager Manual",
    badge: "Faculty",
    description: "Batches, student roster imports, exam setup, question papers, AI rubrics, submission windows, grading overrides, and publishing.",
    iconName: "Users",
    articles: [
      {
        id: "f-01",
        slug: "batches-roster-and-resets",
        role: "faculty",
        guideCode: "F-01",
        title: "Batches, Student Rosters, CSV Bulk Imports & Reset Approvals",
        summary: "Managing classroom batches, adding students individually or via spreadsheet, and approving student password resets.",
        readTimeMinutes: 4,
        lastUpdated: "November 2026",
        screenshotSlot: {
          suggestedPath: "/docs/faculty/batch-roster-overview.png",
          caption: "Figure 2.1: Batches and student roster overview with active batches and password reset alert banner.",
          pins: [
            { number: 1, label: "Student Password Reset Request banner" },
            { number: 2, label: "Active Batches and Enrolled student counters" },
            { number: 3, label: "PWA Claim percentage indicator" },
            { number: 4, label: "Batch cards (CET-1, CET-2)" },
          ],
        },
        overview: "Branch Managers oversee student rosters for their assigned branch. You can create academic batches, onboard students in bulk, and authorize password resets from a single dashboard.",
        steps: [
          {
            title: "1. Faculty & Staff Sign-In",
            description: "Navigate to the portal and select the [ Faculty / Staff ] tab. Enter your registered institutional email or Staff ID and your password to enter the administrative operations console.",
            uiPills: [{ label: "Faculty / Staff", variant: "utility" }],
            screenshot: {
              suggestedPath: "/docs/faculty/staff-sign-in.png",
              caption: "Faculty & Staff Sign-In form for branch managers and teachers.",
              pins: [
                { number: 1, label: "Faculty / Staff tab selected" },
                { number: 2, label: "Institutional Email or Staff ID input" },
                { number: 3, label: "Password and Forgot password link" },
              ],
            },
          },
          {
            title: "2. Create Academic Batches & Review Roster",
            description: "Go to /branch/batches. In the top toolbar, view active batches, enrolled student counts, and PWA claim percentages. Click [ + Create Batch ] to add new classrooms.",
            uiPills: [{ label: "+ Create Batch", variant: "utility" }],
            screenshot: {
              suggestedPath: "/docs/faculty/batch-roster-overview.png",
              caption: "Batches & Student Roster operational view with batch summary metrics.",
              pins: [
                { number: 1, label: "Batches & Student Roster header" },
                { number: 2, label: "Active Batches (2) and Enrolled (28)" },
                { number: 3, label: "100% PWA Claimed badge" },
              ],
            },
          },
          {
            title: "3. Bulk Import Rosters from Excel or CSV",
            description: "To onboard a full class at once, click [ Import Roster (CSV) ]. Prepare a spreadsheet with columns: roll_number, full_name, and email. Drag and drop the file. The dialog validates each row and alerts you to any duplicates. Click [ Confirm Import ].",
            uiPills: [{ label: "Import Roster (CSV)", variant: "utility" }],
            note: "Ensure roll numbers match your institute's official format (e.g. C25-BVI-001) so students can activate their accounts without confusion.",
            noteType: "tip",
          },
          {
            title: "4. Authorize Student Password Resets",
            description: "When a student requests a password reset from the login screen, a yellow alert appears on your batches page: 'Student Password Reset Request Pending Approval'. Click the card to open the authorization desk, verify the student's roll number, and click [ Approve Reset ]. Their phone unlocks immediately in real time.",
            uiPills: [
              { label: "Student Password Reset Requests", variant: "utility" },
              { label: "Approve Reset", variant: "primary" },
            ],
            screenshot: {
              suggestedPath: "/docs/faculty/approve-student-reset-modal.png",
              caption: "Student Password Reset Requests modal showing pending approvals.",
              pins: [
                { number: 1, label: "Student Password Reset Requests header" },
                { number: 2, label: "Pending student request card with roll number" },
                { number: 3, label: "Approval action button" },
              ],
            },
          },
          {
            title: "5. One-Time Initial Password Setup for Staff",
            description: "When a new staff account is provisioned by the Director, enter your initial credentials to set your personal permanent password. Subsequent password resets must be authorized by Root Admin.",
            screenshot: {
              suggestedPath: "/docs/faculty/staff-initial-password-setup.png",
              caption: "One-Time Initial Password Setup modal for newly appointed staff.",
              pins: [
                { number: 1, label: "One-Time Initial Password Setup alert" },
                { number: 2, label: "New Password & Confirm Password inputs" },
              ],
            },
          },
        ],
      },
      {
        id: "f-02",
        slug: "exam-setup-and-materials",
        role: "faculty",
        guideCode: "F-02",
        title: "Creating Exams & Uploading Question Papers / Keys",
        summary: "Setting up a new examination, assigning batches, and uploading master Question Papers and Answer Keys.",
        readTimeMinutes: 3,
        lastUpdated: "November 2026",
        screenshotSlot: {
          suggestedPath: "/docs/faculty/exam-lifecycle-card.png",
          caption: "Figure 2.2: Exam card showing Finalized, Published, and Rubric Approved lifecycle statuses.",
          pins: [
            { number: 1, label: "Exam title and subject (Electromagnetic Induction / Physics)" },
            { number: 2, label: "Total marks badge (25 Marks)" },
            { number: 3, label: "Lifecycle status badges (Finalized, Published, Rubric Approved)" },
          ],
        },
        overview: "Every exam requires an assigned subject, target batches, total marks, and official master documents (Question Paper and Answer Key Scheme).",
        steps: [
          {
            title: "1. Create New Exam",
            description: "Navigate to /exams and click [ + Create Exam ]. Enter Title (e.g. 'Electromagnetic Induction (EMI) Exam'), Subject (e.g. 'Physics'), Total Marks (e.g. '25'), and check the assigned batches.",
            uiPills: [{ label: "+ Create Exam", variant: "primary" }],
            screenshot: {
              suggestedPath: "/docs/faculty/exam-lifecycle-card.png",
              caption: "Exam management card with status indicators.",
              pins: [
                { number: 1, label: "Finalized status indicator" },
                { number: 2, label: "Total Marks display" },
                { number: 3, label: "Rubric Approved and Published badges" },
              ],
            },
          },
          {
            title: "2. Upload Master Question Paper (QP)",
            description: "On the exam dashboard, locate the Academic Materials section. Click [ Upload QP ] and choose your master Question Paper PDF.",
            uiPills: [{ label: "Upload QP", variant: "utility" }],
          },
          {
            title: "3. Upload Official Answer Key",
            description: "Click [ Upload Key ] and choose your official Answer Key / Solution Scheme PDF.",
            uiPills: [{ label: "Upload Key", variant: "utility" }],
          },
          {
            title: "4. Verify Document Rendering",
            description: "Click [ Preview QP ] and [ Preview Key ] to view the documents inside the preview window. Check that formulas, subscripts, and diagrams are clearly readable.",
          },
        ],
      },
      {
        id: "f-03",
        slug: "ai-rubrics-and-best-of-n",
        role: "faculty",
        guideCode: "F-03",
        title: "Setting Up AI Rubrics & Optional Choice Questions (Best-of-N)",
        summary: "Generating step-marking rubrics from answer keys, setting up optional choice rules, and approving rubrics.",
        readTimeMinutes: 4,
        lastUpdated: "November 2026",
        screenshotSlot: {
          suggestedPath: "/docs/faculty/exam-rubric.png",
          caption: "Figure 2.3: AI rubric generator with step criteria editor and Best-of-N choice configuration.",
          pins: [
            { number: 1, label: "Step-by-step criteria breakdown" },
            { number: 2, label: "Marks stepper for partial credit" },
            { number: 3, label: "Best-of-N choice section toggle" },
            { number: 4, label: "Approve Rubric action button" },
          ],
        },
        overview: "PaperGrade grades handwritten answers using step-marking rubrics derived from your official answer key. You can review every point, adjust partial credit, and configure choice rules.",
        steps: [
          {
            title: "1. Generate Rubric from Key",
            description: "On your exam page, click [ Generate Rubric with AI ]. The system analyzes your Question Paper and Answer Key, identifies all questions, and drafts step-by-step marking criteria (e.g., +1 for Formula, +1 for Substitution, +1 for Final Answer with Units).",
            uiPills: [{ label: "Generate Rubric with AI", variant: "primary" }],
            screenshot: {
              suggestedPath: "/docs/faculty/exam-rubric.png",
              caption: "AI rubric matrix showing step-by-step criteria breakdown and mark weights.",
              pins: [
                { number: 1, label: "Step-by-step criteria breakdown" },
                { number: 2, label: "Marks stepper for partial credit" },
                { number: 3, label: "Approve Rubric action button" },
              ],
            },
          },
          {
            title: "2. Configure Optional Choice Questions (Best-of-N)",
            description: "If your exam contains choice sections (for example: 'Answer any 3 out of 5 questions in Section B'), click [ Add Choice Rule ]. Select the eligible question numbers (e.g., Q5, Q6, Q7, Q8, Q9) and set the rule to 'Best 3 of 5'. The evaluation engine will automatically award marks to the 3 highest-scoring answers.",
            uiPills: [{ label: "Add Choice Rule", variant: "utility" }],
            note: "The rubric mathematically enforces that total points equal your exam's total marks. You cannot approve a rubric if the points do not match.",
            noteType: "important",
            screenshot: {
              suggestedPath: "/docs/faculty/exam-rubric-best3.png",
              caption: "Rubric editor displaying Best-of-3 choice section rules and step-by-step partial marks.",
              pins: [
                { number: 1, label: "Best of 3 Rule Active indicator" },
                { number: 2, label: "Choice section description (Solve Any 3)" },
                { number: 3, label: "Question statement and partial marks breakdown" },
              ],
            },
          },
          {
            title: "3. Review & Approve the Rubric",
            description: "Check the criteria for each question. Use the [+] and [-] steppers to adjust marks if needed. Once satisfied, click [ Approve Rubric ]. The exam status turns green: 'Rubric Approved'.",
            uiPills: [{ label: "Approve Rubric", variant: "primary" }],
          },
        ],
      },
      {
        id: "f-04",
        slug: "submission-windows-and-extensions",
        role: "faculty",
        guideCode: "F-04",
        title: "Controlling Live Submission Windows & Emergency Extensions",
        summary: "Opening live submission windows, monitoring submission counters in real time, giving +15 min extensions, and closing windows.",
        readTimeMinutes: 3,
        lastUpdated: "November 2026",
        screenshotSlot: {
          suggestedPath: "/docs/faculty/live-window.png",
          caption: "Figure 2.4: Live exam submission control card showing real-time countdown and +15 min extension button.",
          pins: [
            { number: 1, label: "Active submission window countdown" },
            { number: 2, label: "+15 Min emergency extension button" },
            { number: 3, label: "Real-time submission counter" },
            { number: 4, label: "Close Window action" },
          ],
        },
        overview: "Students can only submit answer sheets during an active window opened by faculty. You retain real-time control over time limits and extensions.",
        steps: [
          {
            title: "1. Open the Submission Window",
            description: "When students are seated and ready, go to the exam page and click [ + Open Window ]. Set the window duration in minutes (e.g. 60 minutes) and click Confirm. Student phones immediately show the active exam card.",
            uiPills: [{ label: "+ Open Window", variant: "primary" }],
          },
          {
            title: "2. Monitor Submissions Live",
            description: "Watch the live counter on your screen: 'Submitted: X / Total: Y'. The list updates automatically as students submit their papers.",
          },
          {
            title: "3. Grant Emergency Extra Time (+15 Min)",
            description: "If students need extra time to finish scanning their pages, click [ +15 Min ]. The window extends immediately for all unsubmitted students across the batch.",
            uiPills: [{ label: "+15 Min", variant: "utility" }],
            note: "You can click [+15 Min] multiple times if needed. Every extension is recorded in the operational audit log.",
            noteType: "tip",
            screenshot: {
              suggestedPath: "/docs/faculty/live-window.png",
              caption: "Active submission window card with countdown timer and emergency +15 Min extension button.",
              pins: [
                { number: 1, label: "Student Submission Window is LIVE status" },
                { number: 2, label: "Remaining time countdown (e.g. 25:00)" },
                { number: 3, label: "+15 Min emergency extension button" },
                { number: 4, label: "Close Window action" },
              ],
            },
          },
          {
            title: "4. Close the Window",
            description: "When the exam ends, click [ Close Window ]. Submissions lock immediately, preventing any late uploads.",
            uiPills: [{ label: "Close Window", variant: "danger" }],
          },
        ],
      },
      {
        id: "f-05",
        slug: "batch-evaluation-and-overrides",
        role: "faculty",
        guideCode: "F-05",
        title: "AI Batch Evaluation, Flagged Papers & Manual Overrides",
        summary: "Running batch evaluation, clearing papers flagged for teacher review, and editing question marks.",
        readTimeMinutes: 4,
        lastUpdated: "November 2026",
        screenshotSlot: {
          suggestedPath: "/docs/faculty/batch-eval.png",
          caption: "Figure 2.5: Batch evaluation queue progress and teacher manual review panel.",
          pins: [
            { number: 1, label: "Batch evaluation progress bar" },
            { number: 2, label: "Needs Review flagged paper queue" },
            { number: 3, label: "Teacher mark override input" },
            { number: 4, label: "Audit reason note field" },
          ],
        },
        overview: "PaperGrade uses a time-decoupled evaluation workflow. Daytime hours are dedicated to live exam submissions, while batch AI grading runs overnight so system performance never slows down.",
        steps: [
          {
            title: "1. The Daytime vs Overnight Evaluation Rule",
            description: "Live exam submissions and portal browsing take place during the day. AI grading is scheduled after exam hours (overnight batch processing). This ensures 100% of server speed is dedicated to student uploads with zero lag.",
            note: "Client Commitment: Exam results are published the next day or next-to-next day, maintaining highest grading accuracy without rushing.",
            noteType: "important",
          },
          {
            title: "2. Start Batch Evaluation",
            description: "Once the submission window has closed and exam hours are finished, click [ Start Evaluation ]. The evaluation queue processes all submitted answer sheets against the approved rubric.",
            uiPills: [{ label: "Start Evaluation", variant: "primary" }],
            screenshot: {
              suggestedPath: "/docs/faculty/batch-eval.png",
              caption: "Batch evaluation dashboard showing total submissions (28), evaluation status, and flagged papers.",
              pins: [
                { number: 1, label: "Total Submissions counter (28 papers)" },
                { number: 2, label: "Evaluated progress indicator" },
                { number: 3, label: "Needs Review human inspection counter" },
              ],
            },
          },
          {
            title: "3. Inspect Flagged Papers ('Needs Review')",
            description: "If a student's handwriting is partially obscured, or if an unusual solution method was used, the system flags the paper as '● Needs Review' (amber badge). Click [ Review Paper ] to inspect the flagged page.",
            uiPills: [{ label: "Review Paper", variant: "utility" }],
          },
          {
            title: "4. Make Audited Manual Overrides",
            description: "If you wish to adjust marks for any question, click [ Edit Marks ]. Enter the new score and write a brief teacher note (e.g. 'Alternative trigonometric identity accepted per board syllabus'). The paper total recalculates automatically.",
            uiPills: [{ label: "Edit Marks", variant: "utility" }],
          },
        ],
      },
      {
        id: "f-06",
        slug: "publishing-and-marks-matrix",
        role: "faculty",
        guideCode: "F-06",
        title: "Publishing Results, Class Spreadsheet & CSV Exports",
        summary: "Publishing marks to students, inspecting the question-by-question marks matrix, and exporting official grade sheets.",
        readTimeMinutes: 4,
        lastUpdated: "November 2026",
        screenshotSlot: {
          suggestedPath: "/docs/faculty/marks-matrix.png",
          caption: "Figure 2.6: Class Marks Matrix spreadsheet and Ranked Standings with CSV export.",
          pins: [
            { number: 1, label: "Class Marks Matrix & Results header" },
            { number: 2, label: "Rubric Matrix and Ranked Standings tabs" },
            { number: 3, label: "Export CSV grade sheet button" },
            { number: 4, label: "Student rows with marks and rankings" },
          ],
        },
        overview: "Publishing releases marks, vector-stamped papers, and class standings to student phones. You can inspect the entire class in a spreadsheet matrix and export reports.",
        steps: [
          {
            title: "1. Clear All 'Needs Review' Flags First",
            description: "The system enforces a strict quality guardrail: you CANNOT publish results if any papers remain in 'Needs Review' status. All flagged papers must be checked and cleared by a teacher first.",
            note: "If you try to publish with uncleared reviews, the app will block the action and list the unfinished papers.",
            noteType: "important",
          },
          {
            title: "2. Publish Results",
            description: "Once all papers are evaluated and cleared, click [ Publish Results ] in the top action bar. The status changes to '● PUBLISHED'. Students can now see their scores and graded papers.",
            uiPills: [{ label: "Publish Results", variant: "primary" }],
          },
          {
            title: "3. Inspect the Class Marks Matrix (/marks)",
            description: "Go to 'Marks & Inspection' in the sidebar and choose your exam. Switch between [ Rubric Matrix ] (a full spreadsheet showing every student across rows and each question across columns with class averages) and [ Ranked Standings ] (merit leaderboard).",
            uiPills: [
              { label: "Rubric Matrix", variant: "utility" },
              { label: "Ranked Standings", variant: "utility" },
            ],
            screenshot: {
              suggestedPath: "/docs/faculty/marks-matrix.png",
              caption: "Class Marks Matrix and Results dashboard showing student standings and CSV export.",
              pins: [
                { number: 1, label: "Rubric Matrix & Ranked Standings toggle" },
                { number: 2, label: "Exam selection dropdown" },
                { number: 3, label: "Export CSV button" },
              ],
            },
          },
          {
            title: "4. Export CSV Reports",
            description: "Click [ Export CSV ] to download the official grade sheet with roll numbers, total marks, and sorted merit rankings for school records.",
            uiPills: [{ label: "Export CSV", variant: "utility" }],
          },
        ],
      },
      {
        id: "f-07",
        slug: "resolving-revaluations",
        role: "faculty",
        guideCode: "F-07",
        title: "Handling Student Revaluation Appeals",
        summary: "Reviewing challenged questions at the Revaluation Desk, revising marks, and generating updated stamped papers.",
        readTimeMinutes: 3,
        lastUpdated: "November 2026",
        screenshotSlot: {
          suggestedPath: "/docs/faculty/revaluation-desk.png",
          caption: "Figure 2.7: Faculty Revaluation Desk for reviewing student appeals and revising marks.",
          pins: [
            { number: 1, label: "Pending Appeals counter (e.g. 0 Pending Appeals)" },
            { number: 2, label: "Zero Open Grievances status indicator" },
            { number: 3, label: "Branch operations header" },
          ],
        },
        overview: "When students submit revaluation appeals, they appear grouped by paper in the Revaluation Desk for faculty review.",
        steps: [
          {
            title: "1. Open the Revaluation Desk",
            description: "Click 'Revaluation Desk' in the left menu. Filter requests by 'Pending' or 'Resolved'. When all student appeals are handled, the screen displays 'Zero Open Grievances'.",
            screenshot: {
              suggestedPath: "/docs/faculty/revaluation-desk.png",
              caption: "Revaluation Desk overview showing zero pending appeals.",
              pins: [
                { number: 1, label: "0 Pending Appeals counter" },
                { number: 2, label: "Zero Open Grievances message" },
              ],
            },
          },
          {
            title: "2. Inspect the Appeal",
            description: "Click [ Inspect Appeal ] on any pending student row. The student's paper loads zoomed directly onto the challenged question.",
            uiPills: [{ label: "Inspect Appeal", variant: "utility" }],
          },
          {
            title: "3. Decide the Outcome",
            description: "Read the student's justification alongside the rubric. If the original score was correct, click [ Maintain Original Marks ] and leave a brief teacher note. If the student made a valid point, click [ Revise Marks ], enter the updated score, and explain the change. Click [ Confirm Resolution ].",
            uiPills: [
              { label: "Maintain Original Marks", variant: "utility" },
              { label: "Revise Marks", variant: "primary" },
            ],
          },
          {
            title: "4. Automatic Paper Re-stamping",
            description: "The system automatically recalculates the student's total score, updates the class rankings, and re-stamps the annotated paper within seconds.",
          },
        ],
      },
    ],
  },
  {
    id: "director",
    label: "Institute Director Manual",
    badge: "Director",
    description: "Multi-branch oversight, student distribution brackets, staff provisioning, staff password resets, and 15-day paper retention.",
    iconName: "Building2",
    articles: [
      {
        id: "d-01",
        slug: "multi-branch-oversight",
        role: "director",
        guideCode: "D-01",
        title: "Multi-Branch Academic Performance Overview",
        summary: "Viewing aggregated student performance, comparing branches, and tracking distinction brackets.",
        readTimeMinutes: 3,
        lastUpdated: "November 2026",
        screenshotSlot: {
          suggestedPath: "/docs/director/branch-switcher-roster.png",
          caption: "Figure 3.1: Director Multi-Branch operational selector and branch roster table.",
          pins: [
            { number: 1, label: "Operational branch selector dropdown" },
            { number: 2, label: "Branch roster overview metrics" },
            { number: 3, label: "Student activation status list" },
          ],
        },
        overview: "Directors have complete cross-branch visibility to monitor student enrollment, active exams, and academic performance distribution across all centers.",
        steps: [
          {
            title: "1. Switch Between Branches",
            description: "Use the Operational Branch dropdown in the top header to toggle between viewing the entire institute or isolating a specific branch (e.g. Test Branch - Borivali vs Kandivali).",
            screenshot: {
              suggestedPath: "/docs/director/branch-switcher-roster.png",
              caption: "Operational Branch selector dropdown showing Mumbai branches and roster details.",
              pins: [
                { number: 1, label: "Operational branch dropdown" },
                { number: 2, label: "Active batches & student enrollment" },
                { number: 3, label: "Student roster with claimed status" },
              ],
            },
          },
          {
            title: "2. Track Academic Brackets",
            description: "The dashboard classifies student performance into three standard academic tiers: Distinction (students scoring 75% or above), Average (students scoring 40% to 74%), and Needs Help (students scoring below 40%).",
          },
          {
            title: "3. Compare Batch Trajectories",
            description: "Review exam participation rates and average score distributions across subjects to identify batches needing additional classroom support.",
          },
        ],
      },
      {
        id: "d-02",
        slug: "staff-management-and-resets",
        role: "director",
        guideCode: "D-02",
        title: "Managing Staff Accounts & Approving Staff Password Resets",
        summary: "Provisioning branch managers, managing access permissions, and authorizing faculty password resets.",
        readTimeMinutes: 3,
        lastUpdated: "November 2026",
        screenshotSlot: {
          suggestedPath: "/docs/director/staff-reset-awaiting-director.png",
          caption: "Figure 3.2: Staff password reset authorization screen awaiting Root Administrator approval.",
          pins: [
            { number: 1, label: "Awaiting Root Administrator Authorization title" },
            { number: 2, label: "Director identity tag" },
            { number: 3, label: "Do Not Refresh or Leave security notice" },
          ],
        },
        overview: "Directors appoint and manage Branch Managers and authorize staff credential changes.",
        steps: [
          {
            title: "1. Appoint a Branch Manager",
            description: "Go to /admin/tenancy. Locate the target branch card and click [ Provision Manager ]. Enter their Full Name, Official Email, and initial password. Click Save.",
            uiPills: [{ label: "Provision Manager", variant: "utility" }],
          },
          {
            title: "2. Update or Revoke Staff Access",
            description: "Use [ Edit Manager ] to update contact details or [ Delete Manager ] to revoke branch management credentials.",
            uiPills: [
              { label: "Edit Manager", variant: "utility" },
              { label: "Delete Manager", variant: "danger" },
            ],
          },
          {
            title: "3. Authorize Staff Password Resets",
            description: "If a Branch Manager or faculty member forgets their password, they submit a reset request on the staff login screen using their institutional email. The request routes directly to the Root Administrator for authorization.",
            screenshot: {
              suggestedPath: "/docs/faculty/staff-password-reset-request.png",
              caption: "Staff Institutional Email password reset request form.",
              pins: [
                { number: 1, label: "Staff Institutional Email input" },
                { number: 2, label: "Dispatch to Root Administrator note" },
              ],
            },
          },
          {
            title: "4. Root Administrator Live Waiting & Unlock",
            description: "While awaiting Director authorization, the staff member's screen displays the live authorization radar. Once approved in /admin/tenancy, their screen instantly unlocks to create a new password.",
            screenshot: {
              suggestedPath: "/docs/director/staff-reset-awaiting-director.png",
              caption: "Live radar screen awaiting Root Administrator authorization.",
              pins: [
                { number: 1, label: "Awaiting Root Administrator Authorization title" },
                { number: 2, label: "Director name & role display" },
              ],
            },
          },
        ],
      },
      {
        id: "d-03",
        slug: "paper-retention-and-records",
        role: "director",
        guideCode: "D-03",
        title: "15-Day Paper Retention Policy & Permanent Academic Records",
        summary: "Understanding how long scanned papers are kept in active storage, and how official student marks are preserved permanently.",
        readTimeMinutes: 3,
        lastUpdated: "November 2026",
        screenshotSlot: {
          suggestedPath: "/docs/student/past-exams-retention.png",
          caption: "Figure 3.3: Past exam cards showing the official 15-day scanned paper retention badge.",
          pins: [
            { number: 1, label: "Results Published status pill" },
            { number: 2, label: "15d retention badge" },
            { number: 3, label: "Exam title & score" },
          ],
        },
        overview: "PaperGrade maintains a clear two-tier data retention policy to keep platform speed high while preserving official academic transcripts permanently.",
        steps: [
          {
            title: "1. The 15-Day Scanned Paper Retention Window",
            description: "Full-resolution scanned handwritten papers are kept in fast active storage for 15 days after an exam's results are officially published. This gives students and teachers ample time to inspect markings, download copies, and resolve any revaluation appeals.",
            screenshot: {
              suggestedPath: "/docs/student/past-exams-retention.png",
              caption: "Exam cards displaying the active 15d retention badge.",
              pins: [
                { number: 1, label: "15d retention indicator" },
              ],
            },
          },
          {
            title: "2. Permanent Academic Records (Never Deleted)",
            description: "After 15 days, the heavy raw paper images are safely archived, but all official academic data—including student total marks, question-by-question scores, percentages, rank standings, and appeal logs—are preserved permanently in the institute's official academic ledger.",
            note: "Teachers and directors can search and review historical student marks from previous years at any time under 'Marks & Inspection'.",
            noteType: "important",
          },
        ],
      },
    ],
  },
];

export function getArticleBySlug(role: RoleId, slug: string): DocArticle | undefined {
  const track = HELP_ROLE_TRACKS.find((t) => t.id === role);
  if (!track) return undefined;
  return track.articles.find((a) => a.slug === slug);
}

export function getAllArticles(): DocArticle[] {
  return HELP_ROLE_TRACKS.flatMap((t) => t.articles);
}

export function getAdjacentArticles(role: RoleId, slug: string): { prev?: DocArticle; next?: DocArticle } {
  const track = HELP_ROLE_TRACKS.find((t) => t.id === role);
  if (!track) return {};
  const idx = track.articles.findIndex((a) => a.slug === slug);
  if (idx === -1) return {};
  return {
    prev: idx > 0 ? track.articles[idx - 1] : undefined,
    next: idx < track.articles.length - 1 ? track.articles[idx + 1] : undefined,
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

