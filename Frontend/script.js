const memoryGrid = document.getElementById("memoryGrid");

let memories = [

{
    title:"NYC CodeQuest Problem Statement",

    image:"images/codequest.png",

    tag:"Hackathon",

    collection:"Hackathons",

    summary:"Contains hackathon rules and judging criteria.",

    time:"Today • 4:32 PM",

    pinned:true
},

{
    title:"Recall UI Inspiration",

    image:"images/design.png",

    tag:"Design",

    collection:"Recall",

    summary:"Dashboard inspiration for Recall.",

    time:"Today • 2:10 PM",

    pinned:false
},

{
    title:"Sony WH-1000XM5",

    image:"images/headphone.png",

    tag:"Shopping",

    collection:"Shopping",

    summary:"Headphone comparison screenshot.",

    time:"Yesterday • 9:18 PM",

    pinned:false
}

];

function renderMemories(){

memoryGrid.innerHTML="";

memories.forEach(memory=>{

const card=document.createElement("div");

card.className="memory-card";

card.innerHTML=`

<img src="${memory.image}">

<div class="memory-content">

<span class="tag">

${memory.tag}

</span>

<h3>${memory.title}</h3>

<p>

${memory.summary}

</p>

<div class="memory-footer">

<span>

📂 ${memory.collection}

</span>

<span>

📅 ${memory.time}

</span>

</div>

</div>

`;

memoryGrid.appendChild(card);

});

}

renderMemories();