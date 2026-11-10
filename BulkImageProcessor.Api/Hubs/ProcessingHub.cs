using Microsoft.AspNetCore.SignalR;

namespace BulkImageProcessor.Api.Hubs;

public class ProcessingHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        await Clients.Caller.SendAsync("Connected", Context.ConnectionId);
        await base.OnConnectedAsync();
    }
}
